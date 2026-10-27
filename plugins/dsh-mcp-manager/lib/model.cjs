/**
 * Pure MCP manager rules. No network, no profile writes, no Node built-ins:
 * this file is the single source for the Node Host, the tests, and (inlined by
 * scripts/embed-model.mjs) the browser half.
 */

const MCP_CLIENT = "@deepseek-ai/dsh-mcp-client";
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ENV_REF_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROJECT_FILES = [".dsh/mcp.json", ".dsh/mcp.local.json"];
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 60000;

function bundlePackageName(serverName) {
  return "@local/dsh-mcp-" + serverName;
}

/**
 * Row id inside the bundle patch. The Host passes a fresh `nonce` per install:
 * the profile keeps enable overrides by row id even after a bundle is removed,
 * so reusing "dsh-mcp-<name>" could inherit an old "disabled: false" and start
 * a re-added stdio server without the confirm step.
 */
function bundleRowId(serverName, nonce) {
  const safe = String(nonce ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return "dsh-mcp-" + serverName + (safe ? "-" + safe : "");
}

function nameIssue(name, existing, except) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "empty";
  if (!NAME_RE.test(trimmed)) return "invalid";
  const taken = (existing || []).some((item) => item !== except && item === trimmed);
  if (taken) return "taken";
  return "";
}

/** Chinese fallback text; the browser translates `name.<issue>` through its locale catalog. */
function nameMessage(issue, name) {
  if (issue === "empty") return "请先填写名称。";
  if (issue === "invalid") return "名称只能是字母、数字、下划线和短横线，1 到 32 个字符。";
  if (issue === "taken") return "已经有一台叫「" + String(name).trim() + "」的服务器，请换一个名称。";
  return "";
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

function yamlKey(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : yamlQuote(name);
}

function secretLines(indent, rows) {
  const lines = [];
  for (const row of rows || []) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    if (row.ref) {
      if (!ENV_REF_RE.test(row.ref)) throw new Error("环境变量名无效：" + row.ref);
      lines.push(indent + yamlKey(name) + ": !!js process.env." + row.ref);
    } else if (typeof row.value === "string") {
      lines.push(indent + yamlKey(name) + ": " + yamlQuote(row.value));
    }
  }
  return lines;
}

// 解析可选的工具调用超时配置（毫秒），留空或默认值返回 DEFAULT_TOOL_CALL_TIMEOUT_MS
function normalizeTimeoutMs(value) {
  if (value == null || value === "") return DEFAULT_TOOL_CALL_TIMEOUT_MS;
  const num = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(num) || num <= 0) throw new Error("toolCallTimeoutMs 必须是正整数。");
  return num;
}

/**
 * Official config-bundle files for one server. `origin` (optional) records
 * where an approved project entry came from; it is metadata in package.json,
 * never a Config field.
 */
function bundleFiles(server, origin, nonce, rowId) {
  const serverName = String(server.serverName ?? "").trim();
  const issue = nameIssue(serverName, [], "");
  if (issue) throw new Error(nameMessage(issue, serverName));
  const enabled = server.enabled === true;
  const transport = server.transport === "streamable-http" ? "streamable-http" : "stdio";
  const timeoutMs = normalizeTimeoutMs(server.toolCallTimeoutMs);
  const lines = [
    "- insert:",
    "    - id: " + (rowId || bundleRowId(serverName, nonce)),
    "      name: '" + MCP_CLIENT + "'",
  ];
  if (!enabled) lines.push("      disabled: true");
  lines.push("      config:");
  lines.push("        serverName: " + yamlQuote(serverName));
  lines.push("        transport: " + yamlQuote(transport));
  if (transport === "stdio") {
    if (!String(server.command ?? "").trim()) throw new Error("stdio 需要 command。");
    lines.push("        command: " + yamlQuote(server.command ?? ""));
    lines.push("        args:");
    const args = Array.isArray(server.args) ? server.args : [];
    if (args.some((item) => typeof item !== "string")) throw new Error("args 必须是字符串数组，不能拼成一条 shell 命令。");
    if (args.length === 0) lines[lines.length - 1] = "        args: []";
    for (const arg of args) lines.push("          - " + yamlQuote(arg));
    if (server.cwd) lines.push("        cwd: " + yamlQuote(server.cwd));
    const env = secretLines("          ", server.env);
    if (env.length) lines.push("        env:", ...env);
  } else {
    if (!String(server.url ?? "").trim()) throw new Error("streamable-http 需要 url。");
    lines.push("        url: " + yamlQuote(server.url ?? ""));
    const headers = secretLines("          ", server.headers);
    if (headers.length) lines.push("        headers:", ...headers);
  }
  if (timeoutMs !== DEFAULT_TOOL_CALL_TIMEOUT_MS) {
    lines.push("        toolCallTimeoutMs: " + String(timeoutMs));
  }
  lines.push("        failOnStartupError: true");
  const packageName = bundlePackageName(serverName);
  const pkg = {
    name: packageName,
    version: "1.0.0",
    description: "MCP server (" + serverName + " · " + transport + ")",
    private: true,
    type: "module",
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  };
  if (origin && typeof origin === "object") pkg.dshMcpManager = { origin: { ...origin } };
  const packageJson = JSON.stringify(pkg, null, 2) + "\n";
  return { packageName, rowId: rowId || bundleRowId(serverName, nonce), packageJson, patch: lines.join("\n") + "\n" };
}

/** Names plus set/unset only; never a value. */
function secretView(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  return Object.keys(record).map((name) => {
    const value = record[name];
    const expression = value && typeof value === "object" && typeof value.__jsExpr === "string" ? value.__jsExpr : "";
    const ref = expression.startsWith("process.env.") ? expression.slice("process.env.".length) : "";
    return { name, set: value != null && value !== "", ref };
  });
}

/**
 * Read env/header rows back out of a patch this module wrote (bundleFiles).
 * Used when rewriting an owned bundle so "keep" rows stay exactly as stored:
 * an env reference stays a reference instead of being resolved into a literal.
 */
function bundleSecrets(patchText) {
  const out = { env: {}, headers: {} };
  let section = "";
  for (const line of String(patchText || "").split(/\r?\n/)) {
    const head = /^ {8}(env|headers):\s*$/.exec(line);
    if (head) { section = head[1]; continue; }
    if (!/^ {10}\S/.test(line)) { section = ""; continue; }
    if (!section) continue;
    const item = /^ {10}("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*):\s(.*)$/.exec(line);
    if (!item) continue;
    const name = item[1].startsWith('"') ? JSON.parse(item[1]) : item[1];
    const ref = /^!!js process\.env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(item[2].trim());
    if (ref) out[section][name] = { ref: ref[1] };
    else {
      try { out[section][name] = { value: String(JSON.parse(item[2])) }; } catch { /* not ours */ }
    }
  }
  return out;
}

/** Resolve editor rows against stored rows from bundleSecrets: keep → the stored ref/value. */
function keepSecretRows(stored, rows) {
  const source = stored && typeof stored === "object" ? stored : {};
  const out = [];
  for (const row of rows || []) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    if (row.keep) {
      if (Object.prototype.hasOwnProperty.call(source, name)) out.push({ name, ...source[name] });
      continue;
    }
    if (row.ref) out.push({ name, ref: row.ref });
    else if (typeof row.value === "string") out.push({ name, value: row.value });
  }
  return out;
}

function mergeSecrets(current, rows) {
  const source = current && typeof current === "object" && !Array.isArray(current) ? current : {};
  const out = {};
  for (const row of rows || []) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    if (row.keep) {
      if (Object.prototype.hasOwnProperty.call(source, name)) out[name] = source[name];
      continue;
    }
    if (row.ref) {
      if (!ENV_REF_RE.test(row.ref)) throw new Error("环境变量名无效：" + row.ref);
      out[name] = { __jsExpr: "process.env." + row.ref };
    } else if (typeof row.value === "string") out[name] = row.value;
  }
  return out;
}

/** Turn a stored `{ NAME: "${VAR}" }`-style literal into an env reference when it is exactly one variable. */
function refFromLiteral(value) {
  if (typeof value !== "string") return "";
  const match = /^\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}$|^\$([A-Za-z_][A-Za-z0-9_]*)$/.exec(value.trim());
  return match ? match[1] || match[2] : "";
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function secretInput(record) {
  const source = asObject(record);
  if (!source) return [];
  return Object.keys(source).map((name) => {
    const raw = source[name];
    const ref = refFromLiteral(raw);
    return {
      name,
      set: raw != null && raw !== "",
      value: ref ? "" : typeof raw === "string" ? raw : "",
      ref,
    };
  });
}

const SKIP_TEXT = {
  notObject: "不是对象",
  "name.empty": "名称为空",
  "name.invalid": "名称只能是字母、数字、下划线和短横线，1 到 32 个字符",
  duplicate: "这份 JSON 里名称重复",
  existing: "已经配置过「{name}」，不会重复添加",
  oauth: "DSH 没有 OAuth",
  sse: "DSH 不支持旧 SSE",
  ws: "DSH 不支持 WebSocket",
  unsupportedType: "DSH 不支持这种传输",
  noType: "没有可识别的 type",
  noCommand: "stdio 缺少 command",
  badArgs: "args 必须是字符串数组，不会按空格拆开",
  noUrl: "缺少 url",
};
const NOTE_TEXT = { envFile: "已忽略 envFile" };

function fill(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (params && params[key] != null ? String(params[key]) : ""));
}

function pushSkip(rows, name, code) {
  const reason = fill(SKIP_TEXT[code] || code, { name });
  rows.push({ name, skip: true, code, notes: [], reason, text: (name ? name + " · " : "") + "跳过：" + reason });
}

/** Masked, value-free projection of one parsed server for previews and the project list. */
function maskServer(server) {
  return {
    serverName: server.serverName,
    transport: server.transport,
    command: server.command || "",
    args: Array.isArray(server.args) ? server.args.slice() : [],
    cwd: server.cwd || "",
    url: maskUrl(server.url || ""),
    env: (server.env || []).map((row) => ({ name: row.name, set: !!(row.set || row.value || row.ref), ref: row.ref || "" })),
    headers: (server.headers || []).map((row) => ({ name: row.name, set: !!(row.set || row.value || row.ref), ref: row.ref || "" })),
  };
}

function maskUrl(url) {
  const text = String(url || "");
  const query = text.indexOf("?");
  const hash = text.indexOf("#");
  const cut = [query, hash].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const base = cut === undefined ? text : text.slice(0, cut) + "?…";
  return base.replace(/^(\w+:\/\/)[^/@]*@/, "$1…@");
}

// 对错误诊断文本中的 URL 查询参数、认证头和敏感键值进行脱敏
function redactText(text) {
  return String(text || "")
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>)]+/gi, (match) => maskUrl(match))
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 ?[credentials-redacted]")
    .replace(/\b([A-Za-z0-9_]*(?:KEY|PASSWORD|SECRET|TOKEN|AUTH)[A-Za-z0-9_]*)=([^\s"'&]+)/gi, "$1=?[credentials-redacted]");
}

/**
 * Parse Claude / Cursor / Claude Desktop `mcpServers` JSON (or a bare table).
 * Rows carry a stable `code` (skip reason) and `notes` codes for translation,
 * plus Chinese `reason`/`text`. Kept rows carry `server` (may hold literal
 * secret values — never put `server` in a preview; use `masked`).
 */
function parseImport(text, existingNames) {
  const rows = [];
  let parsed;
  try {
    parsed = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return { error: "这不是有效的 JSON。", errorCode: "json", rows };
  }
  const root = asObject(parsed);
  const table = root && asObject(root.mcpServers) ? root.mcpServers : root;
  if (!table) return { error: "需要一个 mcpServers 对象。", errorCode: "shape", rows };
  const seen = Object.create(null);
  const existing = new Set(existingNames || []);
  for (const name of Object.keys(table)) {
    const entry = asObject(table[name]);
    if (!entry) { pushSkip(rows, name, "notObject"); continue; }
    const issue = nameIssue(name, [], "");
    if (issue) { pushSkip(rows, name, "name." + issue); continue; }
    if (seen[name]) { pushSkip(rows, name, "duplicate"); continue; }
    seen[name] = true;
    if (existing.has(name)) { pushSkip(rows, name, "existing"); continue; }
    const type = typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "";
    const notes = [];
    if (entry.envFile != null) notes.push("envFile");
    if (entry.oauth != null || entry.auth != null) { pushSkip(rows, name, "oauth"); continue; }
    if (type === "sse") { pushSkip(rows, name, "sse"); continue; }
    if (type === "ws" || type === "websocket") { pushSkip(rows, name, "ws"); continue; }
    if (type && type !== "http" && type !== "streamable-http" && type !== "stdio") { pushSkip(rows, name, "unsupportedType"); continue; }
    let transport;
    if (type === "http" || type === "streamable-http") transport = "streamable-http";
    else if (type === "stdio" || (!type && typeof entry.command === "string")) transport = "stdio";
    else { pushSkip(rows, name, "noType"); continue; }
    const server = { serverName: name, transport, enabled: false, command: "", args: [], cwd: "", url: "", env: [], headers: [] };
    if (transport === "stdio") {
      if (typeof entry.command !== "string" || !entry.command.trim()) { pushSkip(rows, name, "noCommand"); continue; }
      server.command = entry.command;
      if (entry.args == null) server.args = [];
      else if (!Array.isArray(entry.args) || entry.args.some((item) => typeof item !== "string")) { pushSkip(rows, name, "badArgs"); continue; }
      else server.args = entry.args.slice();
      if (typeof entry.cwd === "string") server.cwd = entry.cwd;
      server.env = secretInput(entry.env);
    } else {
      if (typeof entry.url !== "string" || !entry.url.trim()) { pushSkip(rows, name, "noUrl"); continue; }
      server.url = entry.url;
      server.headers = secretInput(entry.headers);
    }
    const noteText = notes.map((code) => NOTE_TEXT[code] || code);
    const textLine = name + " · " + transport + (noteText.length ? " · " + noteText.join("，") : "") + " · 导入后停用";
    rows.push({ name, skip: false, code: "", notes, reason: noteText.join("，"), text: textLine, server, masked: maskServer(server) });
  }
  return { error: "", errorCode: "", rows };
}

function previewText(parsed) {
  return (parsed?.rows || []).map((row) => row.text).join("\n");
}

/** Value-free copy of a parse result, safe to send to the browser. */
function publicRows(parsed) {
  return (parsed?.rows || []).map((row) => ({
    name: row.name,
    skip: row.skip,
    code: row.code || "",
    notes: row.notes || [],
    transport: row.server ? row.server.transport : "",
    masked: row.masked || null,
  }));
}

/**
 * Project-scope view of one workspace: `.dsh/mcp.json` then `.dsh/mcp.local.json`.
 * `files` is [{ file, text | null, error? }] as read by the Host. A name in the
 * shared file wins over the same name in the local file (shown as duplicate).
 * Nothing here connects anything; rows are pending until the user approves them.
 */
function projectPending(files, existingNames) {
  const known = new Set(existingNames || []);
  const out = [];
  for (const item of files || []) {
    if (item.text == null) { out.push({ file: item.file, present: false, error: item.error || "", rows: [] }); continue; }
    const parsed = parseImport(item.text, [...known]);
    if (parsed.error) { out.push({ file: item.file, present: true, error: parsed.errorCode, rows: [] }); continue; }
    for (const row of parsed.rows) if (!row.skip) known.add(row.name);
    out.push({ file: item.file, present: true, error: "", rows: parsed.rows });
  }
  return out;
}

/**
 * Curated starting points for the Add form. Filling a template never runs
 * anything: the user still saves, and enabling stdio still needs the argv
 * confirmation. Placeholders in `<...>` must be replaced by the user.
 */
const TEMPLATES = [
  { id: "filesystem", serverName: "filesystem", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "<directory>"], env: [] },
  { id: "memory", serverName: "memory", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], env: [] },
  { id: "everything", serverName: "everything", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-everything"], env: [] },
  { id: "sequential-thinking", serverName: "sequential-thinking", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], env: [] },
  { id: "fetch", serverName: "fetch", transport: "stdio", command: "uvx", args: ["mcp-server-fetch"], env: [] },
  { id: "git", serverName: "git", transport: "stdio", command: "uvx", args: ["mcp-server-git", "--repository", "<repository>"], env: [] },
  { id: "github", serverName: "github", transport: "streamable-http", url: "https://api.githubcopilot.com/mcp/", headers: [{ name: "Authorization", ref: "GITHUB_MCP_AUTHORIZATION" }] },
];

function templateDraft(id) {
  const t = TEMPLATES.find((item) => item.id === id);
  if (!t) return null;
  return {
    patchId: "",
    serverName: t.serverName,
    transport: t.transport,
    command: t.command || "",
    args: (t.args || []).slice(),
    cwd: "",
    url: t.url || "",
    env: (t.env || []).map((row) => ({ name: row.name, ref: row.ref || "", value: "", set: !!row.ref, keep: false })),
    headers: (t.headers || []).map((row) => ({ name: row.name, ref: row.ref || "", value: "", set: !!row.ref, keep: false })),
    toolCallTimeoutMs: DEFAULT_TOOL_CALL_TIMEOUT_MS,
    enabled: false,
  };
}

/** Placeholders a template left for the user (`<directory>` etc.). */
function hasPlaceholder(server) {
  const parts = [server?.command, server?.url, ...(server?.args || [])];
  return parts.some((part) => typeof part === "string" && /<[a-z-]+>/.test(part));
}

/** Status from facts only (research §5.5). */
function statusOf(facts) {
  if (!facts.enabled) return "disabled";
  if (facts.fiberPhase === "failed") return "failed";
  if (facts.toolCount > 0) return "connected";
  if (facts.fiberPhase === "active") return "empty";
  return "unknown";
}

/** Whether a stdio launch (argv or cwd) differs from the last confirmed one. */
function launchChanged(previous, next) {
  if (!next || next.transport !== "stdio") return false;
  if (!previous || previous.transport !== "stdio") return true;
  return previous.command !== next.command || (previous.cwd || "") !== (next.cwd || "") || JSON.stringify(previous.args || []) !== JSON.stringify(next.args || []);
}

module.exports = {
  MCP_CLIENT,
  NAME_RE,
  PROJECT_FILES,
  DEFAULT_TOOL_CALL_TIMEOUT_MS,
  TEMPLATES,
  bundlePackageName,
  bundleRowId,
  nameIssue,
  nameMessage,
  normalizeTimeoutMs,
  bundleFiles,
  secretView,
  mergeSecrets,
  bundleSecrets,
  keepSecretRows,
  parseImport,
  previewText,
  publicRows,
  projectPending,
  maskServer,
  maskUrl,
  redactText,
  templateDraft,
  hasPlaceholder,
  statusOf,
  launchChanged,
};
