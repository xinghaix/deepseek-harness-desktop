import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Connections, ConnectionRuntime, connectionDomain } from "./connections.js";
import z from "@deepseek-ai/schemastery";

const require = createRequire(import.meta.url);
const model = require("./model.cjs");

// 连接记录由 storageDomain 持久化；Loader 私有子树负责运行时，不为每台服务器安装配置包。
export const name = "dsh-mcp-manager";
// connection 路由继续复用 DSH 的 cookie 会话与 Host/Origin 校验。
export const inject = ["configEditor", "pluginManager", "tools", "connection", "loader", "storageDomain"];

/** No persisted fields: earlier builds used volatile request/view fields, which the settings form persisted into the profile patch. */
export const Config = z.object({});

export const STATE_PATH = "/api/dsh-mcp-manager/state";
export const ACTION_PATH = "/api/dsh-mcp-manager/action";
const MAX_PROJECT_FILE_BYTES = 256 * 1024;

function profileDir(ctx) {
  return dirname(ctx.configEditor.documentPath);
}

function prefsFilePath(ctx) {
  return join(profileDir(ctx), "mcp-bundles", ".preferences.json");
}

async function readManagerPrefs(ctx) {
  try {
    const raw = JSON.parse(await readFile(prefsFilePath(ctx), "utf8"));
    return {
      showSidebarEntry: raw?.showSidebarEntry !== false,
    };
  } catch {
    return { showSidebarEntry: true };
  }
}

async function writeManagerPrefs(ctx, patch) {
  const current = await readManagerPrefs(ctx);
  const next = {
    ...current,
    ...(typeof patch?.showSidebarEntry === "boolean" ? { showSidebarEntry: patch.showSidebarEntry } : {}),
  };
  const file = prefsFilePath(ctx);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

// 单次扫描 ctx.tools.schemas()，避免多台服务器重复触发 dsh-tools 全量 schema 克隆
function collectToolsByServer(ctx, activeServerNames) {
  const byServer = new Map();
  if (!activeServerNames.size || typeof ctx.tools?.schemas !== "function") return byServer;
  const prefixes = [...activeServerNames].map((serverName) => ({
    serverName,
    prefix: "mcp__" + serverName + "__",
  }));
  for (const schema of ctx.tools.schemas() || []) {
    const publicName = typeof schema?.name === "string" ? schema.name : "";
    if (!publicName.startsWith("mcp__")) continue;
    for (const { serverName, prefix } of prefixes) {
      if (!publicName.startsWith(prefix)) continue;
      const shortName = publicName.slice(prefix.length);
      let bucket = byServer.get(serverName);
      if (!bucket) {
        bucket = [];
        byServer.set(serverName, bucket);
      }
      const rawDesc = typeof schema?.description === "string" ? schema.description.trim().split(/\r?\n/)[0] : "";
      bucket.push({
        name: shortName,
        publicName,
        description: rawDesc ? model.redactText(rawDesc).slice(0, 180) : "",
      });
      break;
    }
  }
  for (const list of byServer.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return byServer;
}

function mcpEntries(ctx) {
  return [...ctx.loader.entries()].filter((entry) => entry.options?.name === model.MCP_CLIENT);
}

function serverNames(ctx, exceptId, connections) {
  return [...new Set([
    ...mcpEntries(ctx).filter((entry) => entry.options.id !== exceptId).map((entry) => String(entry.options.config?.serverName || "").trim()),
    ...(connections?.records() || []).filter((record) => record.id !== exceptId).map((record) => record.config.serverName),
  ].filter(Boolean))];
}

async function readOrigin(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    return pkg?.dshMcpManager?.origin || null;
  } catch {
    return null;
  }
}

async function servers(ctx, lastErrors, connections) {
  const [plugins, bundles] = await Promise.all([ctx.pluginManager.listPlugins(), ctx.pluginManager.listBundles()]);
  const records = connections.records().filter((record) => !record.legacy?.pending);
  const ids = new Set(records.map((record) => record.id));
  const entries = mcpEntries(ctx).filter((entry) => !ids.has(entry.options.id));
  const rows = [];
  for (const entry of entries) {
    const config = entry.options.config || {};
    const plugin = plugins.find((item) => item.entryId === entry.id || item.patchId === entry.options.id && item.moduleName === model.MCP_CLIENT);
    const bundleName = model.NAME_RE.test(config.serverName || "") ? model.bundlePackageName(config.serverName) : "";
    const owned = connections.legacyNames.has(bundleName) && bundles.some((bundle) => bundle.name === bundleName);
    rows.push({
      config,
      patchId: entry.options.id,
      pluginEntryId: plugin?.entryId || "",
      enabled: plugin ? plugin.enabled === true : !entry.disabled,
      fiberPhase: plugin?.fiberPhase || null,
      external: !owned,
      bundleName: owned ? bundleName : "",
      origin: owned ? await readOrigin(join(profileDir(ctx), "mcp-bundles", config.serverName)) : null,
      lastError: lastErrors.get(config.serverName) || "",
    });
  }
  for (const record of records) {
    const entry = connections.runtime.entry(record.id);
    const phase = entry?.fiber?.state;
    const rawFiberErr = entry?.fiber?._error;
    const fiberErrText = rawFiberErr ? model.redactText(String(rawFiberErr?.cause?.message || rawFiberErr?.message || rawFiberErr)) : "";
    rows.push({
      config: record.config,
      patchId: record.id,
      pluginEntryId: record.id,
      enabled: record.enabled,
      fiberPhase: connections.errors.has(record.id) ? "failed" : phase === 2 ? "active" : phase === 3 ? "failed" : "loading",
      external: false,
      bundleName: "",
      origin: record.origin || null,
      lastError: connections.errors.get(record.id) || fiberErrText,
    });
  }
  const activeNames = new Set(rows.filter((row) => row.enabled).map((row) => row.config.serverName));
  const toolsByServer = collectToolsByServer(ctx, activeNames);
  return rows.map(({ config, ...row }) => {
    const serverName = String(config.serverName || "").trim();
    const toolDetails = toolsByServer.get(serverName) || [];
    const status = model.statusOf({ enabled: row.enabled, fiberPhase: row.fiberPhase, toolCount: toolDetails.length });
    if (["connected", "empty", "disabled"].includes(status)) lastErrors.delete(serverName);
    return {
      ...row,
      serverName,
      transport: config.transport === "streamable-http" ? "streamable-http" : "stdio",
      command: typeof config.command === "string" ? config.command : "",
      args: Array.isArray(config.args) ? config.args.filter((item) => typeof item === "string") : [],
      cwd: typeof config.cwd === "string" ? config.cwd : "",
      url: typeof config.url === "string" ? model.maskUrl(config.url) : "",
      env: model.secretView(config.env),
      headers: model.secretView(config.headers),
      toolCallTimeoutMs: config.toolCallTimeoutMs || model.DEFAULT_TOOL_CALL_TIMEOUT_MS,
      status,
      lastError: status === "failed" ? row.lastError : "",
      tools: toolDetails.map((tool) => tool.name),
      toolDetails,
    };
  });
}

// ---- project scope (research §5.6): read-only until the user approves ----

function workspaceSource(ctx) {
  let controller;
  let registry;
  ctx.inject(["workspaceRegistry"], (inner) => {
    registry = inner.workspaceRegistry;
    return () => { registry = undefined; };
  });
  ctx.inject(["workspaceController"], (inner) => {
    controller = inner.workspaceController;
    return () => { controller = undefined; };
  });
  return async () => {
    // DSH 0.2.1+ 优先直接读取同步的 workspaceRegistry，避免每次轮询构造异步流和定时器
    const reg = registry || ctx.get?.("workspaceRegistry") || ctx.workspaceRegistry;
    if (reg && typeof reg.list === "function") {
      try {
        return (reg.list() || []).map((item) => ({
          workspaceId: item.id ?? item.workspaceId,
          title: item.title,
          path: item.path,
        }));
      } catch {
        // 回退到 workspaceController
      }
    }
    if (!controller || typeof controller.follow !== "function") return [];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 3000);
    try {
      for await (const frame of controller.follow(abort.signal)) {
        if (frame?.type === "baseline") return (frame.value?.items || []).map((item) => ({ workspaceId: item.workspaceId, title: item.title, path: item.path }));
        break;
      }
      return [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  };
}

// 基于文件 (mtimeMs, size) 的轻量缓存，避免轮询时重复读取未变更的 .dsh/mcp*.json
const projectFileCache = new Map();

async function readProjectFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { text: null, error: "unreadable" };
    if (info.size > MAX_PROJECT_FILE_BYTES) return { text: null, error: "tooLarge" };
    const cached = projectFileCache.get(path);
    if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { text: cached.text, error: "" };
    }
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text) > MAX_PROJECT_FILE_BYTES) return { text: null, error: "tooLarge" };
    if (projectFileCache.size > 128) projectFileCache.clear();
    projectFileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, text });
    return { text, error: "" };
  } catch (error) {
    projectFileCache.delete(path);
    return { text: null, error: error?.code === "ENOENT" ? "" : "unreadable" };
  }
}

async function projectScan(workspaces, existing) {
  const out = [];
  for (const ws of workspaces) {
    const files = [];
    for (const file of model.PROJECT_FILES) {
      const read = await readProjectFile(join(ws.path, file));
      files.push({ file, text: read.text, error: read.error });
    }
    out.push({ ...ws, files: model.projectPending(files, existing) });
  }
  return out;
}

function publicProject(scan) {
  return scan.map((ws) => ({
    workspaceId: ws.workspaceId,
    title: ws.title,
    path: ws.path,
    files: ws.files.map((f) => ({ file: f.file, present: f.present, error: f.error, rows: model.publicRows({ rows: f.rows }) })),
  }));
}

// ---- writes ----

async function writeBundle(ctx, server, origin, rowId) {
  const files = model.bundleFiles(server, origin, Date.now().toString(36) + Math.random().toString(36).slice(2, 6), rowId);
  const dir = join(profileDir(ctx), "mcp-bundles", String(server.serverName).trim());
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), files.packageJson);
  await writeFile(join(dir, "cordis.patch.yml"), files.patch);
  return { dir, rowId: files.rowId };
}

function findEntry(ctx, patchId) {
  return mcpEntries(ctx).find((entry) => entry.options?.id === patchId);
}

async function pluginRow(ctx, patchId) {
  const plugins = await ctx.pluginManager.listPlugins();
  return plugins.find((item) => item.patchId === patchId && item.moduleName === model.MCP_CLIENT) || null;
}

async function forceEnabled(ctx, patchId, enabled) {
  const row = await pluginRow(ctx, patchId);
  if (!row || row.enabled === enabled) return;
  const result = await ctx.pluginManager.setPluginEnabled(row.entryId, enabled);
  const error = resultError(result, "toggle failed");
  if (error) throw error;
}

class CodedError extends Error {
  constructor(code, params, message) {
    super(message || code);
    this.code = code;
    this.params = params || {};
  }
}

function resultError(result, fallback) {
  const error = result?.error;
  if (!error) return null;
  // Diagnostics carry full stacks; the page only needs the readable lines (redacted).
  const text = model.redactText(
    String(error.diagnostic || error.code || fallback)
      .split("\n")
      .filter((line) => !/^\s+at\s/.test(line))
      .join("\n")
  ).slice(0, 600);
  return new Error(text);
}

async function saveServer(ctx, server, origin, lastErrors, connections) {
  const patchId = server.patchId || "";
  const trimmedName = String(server.serverName ?? "").trim();
  const issue = model.nameIssue(server.serverName, serverNames(ctx, patchId, connections), "");
  if (issue) throw new CodedError("name." + issue, { name: trimmedName }, model.nameMessage(issue, server.serverName));
  if (model.hasPlaceholder(server)) throw new CodedError("placeholder", {}, "请先替换模板里的 <占位符>。");
  const timeoutMs = model.normalizeTimeoutMs(server.toolCallTimeoutMs);
  const managed = patchId ? connections.get(patchId) : null;
  if (!patchId || managed && !managed.legacy?.pending) {
    if (managed && managed.config.serverName !== trimmedName) throw new CodedError("renameOwned");
    return connections.save(server, origin);
  }
  const existing = findEntry(ctx, patchId);
  if (!existing) throw new CodedError("noEntry");
  try {
    const current = existing.options.config || {};
    const currentName = String(current.serverName || "").trim();
    const bundles = await ctx.pluginManager.listBundles();
    const owned = connections.legacyNames.has(model.bundlePackageName(currentName)) && bundles.some((item) => item.name === model.bundlePackageName(currentName));
    if (owned && trimmedName !== currentName) throw new CodedError("renameOwned");
    const next = {
      ...current,
      serverName: trimmedName,
      transport: server.transport === "streamable-http" ? "streamable-http" : "stdio",
    };
    if (timeoutMs !== model.DEFAULT_TOOL_CALL_TIMEOUT_MS) next.toolCallTimeoutMs = timeoutMs;
    else delete next.toolCallTimeoutMs;
    if (next.transport === "stdio") {
      next.command = server.command || "";
      next.args = Array.isArray(server.args) ? server.args.map((item) => String(item)) : [];
      if (server.cwd) next.cwd = server.cwd;
      else delete next.cwd;
      next.env = model.mergeSecrets(current.env, server.env);
      delete next.url;
      delete next.headers;
    } else {
      // An unchanged masked URL keeps the stored one (query strings are never sent to the page).
      next.url = server.url && server.url !== model.maskUrl(current.url || "") ? server.url : current.url || "";
      next.headers = model.mergeSecrets(current.headers, server.headers);
      delete next.command;
      delete next.args;
      delete next.cwd;
      delete next.env;
    }
    if (owned) {
      // Our own bundle: rewrite its files (the bundle stays the single store, no user-layer
      // override). This works whether or not the server is running; configEditor.edit needs a
      // live fiber and would also copy resolved env values into the profile.
      const row = await pluginRow(ctx, patchId);
      const enabled = row ? row.enabled === true : existing.disabled !== true;
      const dir = join(profileDir(ctx), "mcp-bundles", currentName);
      let stored = { env: {}, headers: {} };
      try { stored = model.bundleSecrets(await readFile(join(dir, "cordis.patch.yml"), "utf8")); } catch { /* rewritten below */ }
      const rewrite = {
        serverName: currentName,
        transport: next.transport,
        command: next.command,
        args: next.args,
        cwd: next.cwd,
        url: next.url,
        env: next.transport === "stdio" ? model.keepSecretRows(stored.env, server.env) : [],
        headers: next.transport === "stdio" ? [] : model.keepSecretRows(stored.headers, server.headers),
        toolCallTimeoutMs: timeoutMs,
        enabled,
      };
      await writeBundle(ctx, rewrite, await readOrigin(dir), patchId);
      // installBundle on an already-installed link is "ambiguous-install"; setPluginEnabled always
      // re-reads every patch file from disk and reconciles, so re-asserting the current state
      // applies the rewritten bundle (a running server restarts with the new config).
      if (!row) return "restart-required";
      // 若此前处于 failed 状态且配置文件内容未发生变化，先置为 false 再置为 true 以确保 DSH 0.2.1 Loader 重新激活 fiber
      if (enabled && row.fiberPhase === "failed") {
        await ctx.pluginManager.setPluginEnabled(row.entryId, false);
      }
      const refreshedRow = (await pluginRow(ctx, patchId)) || row;
      const result = await ctx.pluginManager.setPluginEnabled(refreshedRow.entryId, enabled);
      const error = resultError(result, "reload failed");
      if (error) throw error;
      lastErrors?.delete(currentName);
      return result?.application || "applied";
    }
    if (existing.fiber === undefined) throw new CodedError("editDisabled");
    await ctx.configEditor.edit(existing, () => next);
    lastErrors?.delete(trimmedName);
    return "applied";
  } catch (error) {
    if (trimmedName && !(error instanceof CodedError)) {
      lastErrors?.set(trimmedName, model.redactText(error instanceof Error ? error.message : String(error)));
    }
    throw error;
  }
}

async function runJob(ctx, job, listWorkspaces, lastErrors, connections) {
  if (!job || typeof job !== "object") throw new CodedError("badRequest");
  if (job.op === "save") return { notice: "", application: await saveServer(ctx, job.server || {}, undefined, lastErrors, connections) };
  const managed = job.patchId ? connections.get(job.patchId) : null;
  if (managed && !managed.legacy?.pending && ["remove", "enable", "reconnect"].includes(job.op)) {
    if (job.op === "remove") {
      await connections.remove(managed);
      return { notice: "removed", noticeParams: { name: managed.config.serverName }, application: "applied" };
    }
    if (job.op === "reconnect" && !managed.enabled) throw new CodedError("noEntry");
    const application = await connections.setEnabled(managed, job.op === "reconnect" || job.enabled === true);
    return { notice: job.op === "reconnect" ? "reconnected" : "", noticeParams: { name: managed.config.serverName }, application };
  }
  if (job.op === "remove") {
    const name = String(job.serverName || "").trim();
    if (!model.NAME_RE.test(name) || job.bundleName !== model.bundlePackageName(name) || !connections.legacyNames.has(job.bundleName)) throw new CodedError("externalDelete");
    const bundles = await ctx.pluginManager.listBundles();
    if (!bundles.some((item) => item.name === job.bundleName)) throw new CodedError("externalDelete");
    const pending = connections.records().filter((record) => record.legacy?.bundleName === job.bundleName);
    try {
      // 迁移失败后删除旧连接时，同时移除 pending 记录，防止下次启动把已删除连接恢复回来。
      for (const record of pending) {
        await connections.runtime.remove(record.id);
        await connections.table.delete(record.id);
      }
      // 留下的 profile 覆盖保持 disabled，防止同名旧行被意外重新启用。
      for (const entry of mcpEntries(ctx)) {
        if (String(entry.options?.config?.serverName || "").trim() === name) await forceEnabled(ctx, entry.options.id, false);
      }
      const result = await ctx.pluginManager.removeBundle(job.bundleName);
      const error = resultError(result, "remove failed");
      if (error) throw error;
      await rm(join(profileDir(ctx), "mcp-bundles", name), { recursive: true, force: true });
      lastErrors?.delete(name);
      return { notice: "removed", noticeParams: { name: job.serverName || job.bundleName }, application: result?.application || "applied" };
    } catch (error) {
      for (const record of pending) await connections.table.put(record.id, record);
      throw error;
    }
  }
  if (job.op === "enable") {
    const row = job.patchId ? await pluginRow(ctx, job.patchId) : null;
    if (!row || row.entryId !== job.pluginEntryId) throw new CodedError("noEntry");
    const targetEntry = mcpEntries(ctx).find((e) => e.options?.id === job.patchId);
    const targetName = String(job.serverName || targetEntry?.options?.config?.serverName || "").trim();
    try {
      const result = await ctx.pluginManager.setPluginEnabled(job.pluginEntryId, job.enabled === true);
      const error = resultError(result, "toggle failed");
      if (error) throw error;
      if (targetName) lastErrors?.delete(targetName);
      return { notice: "", application: result?.application || "applied" };
    } catch (error) {
      if (targetName && !(error instanceof CodedError)) {
        lastErrors?.set(targetName, model.redactText(error instanceof Error ? error.message : String(error)));
      }
      throw error;
    }
  }
  if (job.op === "reconnect") {
    const target = job.patchId ? await pluginRow(ctx, job.patchId) : null;
    if (!target || target.entryId !== job.pluginEntryId || !target.enabled) throw new CodedError("noEntry");
    const targetName = String(job.serverName || "").trim();
    try {
      await ctx.pluginManager.setPluginEnabled(job.pluginEntryId, false);
      const row = job.patchId ? await pluginRow(ctx, job.patchId) : null;
      const entryId = row?.entryId || job.pluginEntryId;
      const result = await ctx.pluginManager.setPluginEnabled(entryId, true);
      const error = resultError(result, "reconnect failed");
      if (error) throw error;
      if (targetName) lastErrors?.delete(targetName);
      return { notice: "reconnected", noticeParams: { name: targetName || entryId }, application: result?.application || "applied" };
    } catch (error) {
      if (targetName && !(error instanceof CodedError)) {
        lastErrors?.set(targetName, model.redactText(error instanceof Error ? error.message : String(error)));
      }
      throw error;
    }
  }
  if (job.op === "import") {
    const names = serverNames(ctx, "", connections);
    let added = 0;
    for (const server of job.servers || []) {
      if (names.includes(String(server.serverName || "").trim())) continue;
      await saveServer(ctx, { ...server, enabled: false, patchId: "" }, undefined, lastErrors, connections);
      names.push(String(server.serverName).trim());
      added += 1;
    }
    return { notice: "imported", noticeParams: { count: added }, application: "" };
  }
  if (job.op === "approveProject") {
    // Re-read the files on the Host: the page never sends project secrets back.
    const workspaces = await listWorkspaces();
    const ws = workspaces.find((item) => item.workspaceId === job.workspaceId);
    if (!ws) throw new CodedError("noWorkspace");
    const scan = await projectScan([ws], serverNames(ctx, "", connections));
    const wanted = new Set(Array.isArray(job.names) ? job.names : []);
    let added = 0;
    for (const file of scan[0].files) {
      for (const row of file.rows) {
        if (row.skip || !wanted.has(row.name)) continue;
        await saveServer(ctx, { ...row.server, enabled: false, patchId: "" }, { scope: "project", workspace: ws.path, file: file.file }, lastErrors, connections);
        added += 1;
      }
    }
    return { notice: "approved", noticeParams: { count: added }, application: "" };
  }
  if (job.op === "setPrefs") {
    await writeManagerPrefs(ctx, { showSidebarEntry: job.showSidebarEntry !== false });
    return { notice: "", application: "" };
  }
  throw new CodedError("badRequest");
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export async function apply(ctx) {
  const listWorkspaces = workspaceSource(ctx);
  const lastErrors = new Map();
  const runtime = new ConnectionRuntime(ctx);
  let connections;
  let closing = false;
  let busy = Promise.resolve();
  let stop;
  const stopped = new Promise((resolve) => { stop = resolve; });
  ctx.effect(() => async () => {
    closing = true;
    stop(false);
    await runtime.close();
    // HMR 包操作可能反过来等待本 fiber；不在销毁回调中等待 busy，数据域会拒绝后续写入。
    if (connections) await connections.domain.close();
  }, "dsh-mcp-manager: owned connections");
  const domain = await ctx.storageDomain.open(connectionDomain(profileDir(ctx)));
  connections = new Connections(ctx, domain, runtime, profileDir(ctx));
  if (closing) { await connections.close(); return; }
  // pluginManager 的 HMR 会等待所有 fiber。必须等自己的 apply 结束后才卸载旧包，避免自等待。
  busy = Promise.race([ctx.fiber.await().then(() => true), stopped]).then(async (ready) => {
    if (ready && !closing) await connections.initialize();
  });
  busy = busy.catch((error) => connections.migrationErrors.set(name, model.redactText(String(error.message || error))));

  async function state() {
    const [list, workspaces, prefs] = await Promise.all([
      servers(ctx, lastErrors, connections),
      listWorkspaces(),
      readManagerPrefs(ctx),
    ]);
    const project = await projectScan(workspaces, list.map((item) => item.serverName));
    return {
      servers: list,
      project: publicProject(project),
      templates: model.TEMPLATES.map((t) => ({ id: t.id, transport: t.transport })),
      prefs,
      migrationErrors: [...connections.migrationErrors.entries()].map(([name, message]) => ({ name, message })),
    };
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: STATE_PATH,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => {
      try {
        await busy.catch(() => {});
        return json(await state());
      } catch (error) {
        return json({ error: model.redactText(error instanceof Error ? error.message : String(error)) }, 500);
      }
    },
  }), "dsh-mcp-manager: state route");

  ctx.effect(() => ctx.connection.fetch.register({
    path: ACTION_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      let job;
      try {
        job = await request.json();
      } catch {
        return json({ ok: false, code: "badRequest" }, 400);
      }
      // 迁移、持久化和实例切换共享同一条串行队列。
      const run = busy.then(() => {
        if (closing) throw new CodedError("badRequest");
        return runJob(ctx, job, listWorkspaces, lastErrors, connections);
      });
      busy = run.catch(() => {});
      try {
        const result = await run;
        return json({ ok: true, ...result, state: await state() });
      } catch (error) {
        const coded = error instanceof CodedError;
        let snapshot = null;
        try { snapshot = await state(); } catch {}
        return json({
          ok: false,
          code: coded ? error.code : "",
          params: coded ? error.params : {},
          message: model.redactText(error instanceof Error ? error.message : String(error)),
          state: snapshot,
        }, coded ? 400 : 500);
      }
    },
  }), "dsh-mcp-manager: action route");
}
