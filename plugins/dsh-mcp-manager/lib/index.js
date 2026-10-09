import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import z from "@deepseek-ai/schemastery";

const require = createRequire(import.meta.url);
const model = require("./model.cjs");

/** Cordis plugin name. The server list is never stored here. */
export const name = "dsh-mcp-manager";
/**
 * Profile edits and bundle install live on these host services; `connection`
 * provides the authenticated `/api` Fetch routes the page talks to (cookie
 * session + Host/Origin checks are enforced by dsh-client-connection).
 */
export const inject = ["configEditor", "pluginManager", "tools", "connection"];

/** No persisted fields: earlier builds used volatile request/view fields, which the settings form persisted into the profile patch. */
export const Config = z.object({});

export const STATE_PATH = "/api/dsh-mcp-manager/state";
export const ACTION_PATH = "/api/dsh-mcp-manager/action";
const MAX_PROJECT_FILE_BYTES = 256 * 1024;

function profileDir(ctx) {
  return dirname(ctx.configEditor.documentPath);
}

function toolNames(ctx, serverName) {
  if (!serverName || typeof ctx.tools?.schemas !== "function") return [];
  const prefix = "mcp__" + serverName + "__";
  const names = [];
  for (const schema of ctx.tools.schemas() || []) {
    const toolName = typeof schema?.name === "string" ? schema.name : "";
    if (toolName.startsWith(prefix)) names.push(toolName.slice(prefix.length));
  }
  return names.sort();
}

function mcpEntries(ctx) {
  return ctx.configEditor.entries().filter((entry) => entry.options?.name === model.MCP_CLIENT);
}

function serverNames(ctx, exceptId) {
  return mcpEntries(ctx)
    .filter((entry) => entry.options.id !== exceptId)
    .map((entry) => String(entry.options.config?.serverName || "").trim())
    .filter(Boolean);
}

async function readOrigin(dir) {
  try {
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    return pkg?.dshMcpManager?.origin || null;
  } catch {
    return null;
  }
}

async function servers(ctx) {
  const entries = mcpEntries(ctx);
  const plugins = await ctx.pluginManager.listPlugins();
  const bundles = await ctx.pluginManager.listBundles();
  const out = [];
  for (const entry of entries) {
    const config = entry.options?.config || {};
    const serverName = String(config.serverName || "").trim();
    const plugin = plugins.find((item) => item.patchId === entry.options.id && item.moduleName === model.MCP_CLIENT);
    const bundleName = model.NAME_RE.test(serverName) ? model.bundlePackageName(serverName) : "";
    const owned = bundleName !== "" && bundles.some((item) => item.name === bundleName);
    const tools = toolNames(ctx, serverName);
    const enabled = plugin ? plugin.enabled === true : entry.disabled !== true;
    const origin = owned ? await readOrigin(join(profileDir(ctx), "mcp-bundles", serverName)) : null;
    out.push({
      patchId: entry.options.id,
      pluginEntryId: plugin?.entryId || "",
      serverName,
      transport: config.transport === "streamable-http" ? "streamable-http" : "stdio",
      command: typeof config.command === "string" ? config.command : "",
      args: Array.isArray(config.args) ? config.args.filter((item) => typeof item === "string") : [],
      cwd: typeof config.cwd === "string" ? config.cwd : "",
      url: typeof config.url === "string" ? model.maskUrl(config.url) : "",
      env: model.secretView(config.env),
      headers: model.secretView(config.headers),
      enabled,
      external: !owned,
      bundleName: owned ? bundleName : "",
      origin,
      fiberPhase: plugin?.fiberPhase || null,
      status: model.statusOf({ enabled, fiberPhase: plugin?.fiberPhase || null, toolCount: tools.length }),
      tools,
    });
  }
  return out;
}

// ---- project scope (research §5.6): read-only until the user approves ----

function workspaceSource(ctx) {
  let controller;
  ctx.inject(["workspaceController"], (inner) => {
    controller = inner.workspaceController;
    return () => { controller = undefined; };
  });
  return async () => {
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

async function readProjectFile(path) {
  try {
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text) > MAX_PROJECT_FILE_BYTES) return { text: null, error: "tooLarge" };
    return { text, error: "" };
  } catch (error) {
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
  // Diagnostics carry full stacks; the page only needs the readable lines.
  const text = String(error.diagnostic || error.code || fallback)
    .split("\n")
    .filter((line) => !/^\s+at\s/.test(line))
    .join("\n")
    .slice(0, 600);
  return new Error(text);
}

async function saveServer(ctx, server, origin) {
  const patchId = server.patchId || "";
  const issue = model.nameIssue(server.serverName, serverNames(ctx, patchId), "");
  if (issue) throw new CodedError("name." + issue, { name: String(server.serverName ?? "").trim() }, model.nameMessage(issue, server.serverName));
  if (model.hasPlaceholder(server)) throw new CodedError("placeholder", {}, "请先替换模板里的 <占位符>。");
  const existing = patchId ? findEntry(ctx, patchId) : null;
  if (!existing) {
    const { dir, rowId } = await writeBundle(ctx, { ...server, enabled: server.enabled === true }, origin);
    const result = await ctx.pluginManager.installBundle(dir);
    const error = resultError(result, "install failed");
    if (error) throw error;
    // The profile keeps per-entry enable overrides even after a bundle is removed. If an old
    // "disabled: false" override for this id survived, the new server would start without the
    // stdio confirm. Row ids carry a fresh nonce, and we also force the requested state.
    await forceEnabled(ctx, rowId, server.enabled === true);
    return result?.application || "applied";
  }
  const current = existing.options.config || {};
  const currentName = String(current.serverName || "").trim();
  const bundles = await ctx.pluginManager.listBundles();
  const owned = model.NAME_RE.test(currentName) && bundles.some((item) => item.name === model.bundlePackageName(currentName));
  if (owned && String(server.serverName).trim() !== currentName) throw new CodedError("renameOwned");
  const next = { ...current, serverName: String(server.serverName).trim(), transport: server.transport === "streamable-http" ? "streamable-http" : "stdio" };
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
      enabled,
    };
    await writeBundle(ctx, rewrite, await readOrigin(dir), patchId);
    // installBundle on an already-installed link is "ambiguous-install"; setPluginEnabled always
    // re-reads every patch file from disk and reconciles, so re-asserting the current state
    // applies the rewritten bundle (a running server restarts with the new config).
    if (!row) return "restart-required";
    const result = await ctx.pluginManager.setPluginEnabled(row.entryId, enabled);
    const error = resultError(result, "reload failed");
    if (error) throw error;
    return result?.application || "applied";
  }
  if (existing.fiber === undefined) throw new CodedError("editDisabled");
  await ctx.configEditor.edit(existing, () => next);
  return "applied";
}

async function runJob(ctx, job, listWorkspaces) {
  if (!job || typeof job !== "object") throw new CodedError("badRequest");
  if (job.op === "save") return { notice: "", application: await saveServer(ctx, job.server || {}) };
  if (job.op === "remove") {
    const name = String(job.serverName || "").trim();
    if (!model.NAME_RE.test(name) || job.bundleName !== model.bundlePackageName(name)) throw new CodedError("externalDelete");
    const bundles = await ctx.pluginManager.listBundles();
    if (!bundles.some((item) => item.name === job.bundleName)) throw new CodedError("externalDelete");
    // Stop it first so the enable override left behind in the profile is always "disabled".
    for (const entry of mcpEntries(ctx)) {
      if (String(entry.options?.config?.serverName || "").trim() === name) await forceEnabled(ctx, entry.options.id, false);
    }
    const result = await ctx.pluginManager.removeBundle(job.bundleName);
    const error = resultError(result, "remove failed");
    if (error) throw error;
    await rm(join(profileDir(ctx), "mcp-bundles", name), { recursive: true, force: true });
    return { notice: "removed", noticeParams: { name: job.serverName || job.bundleName }, application: result?.application || "applied" };
  }
  if (job.op === "enable") {
    if (!job.pluginEntryId) throw new CodedError("noEntry");
    const result = await ctx.pluginManager.setPluginEnabled(job.pluginEntryId, job.enabled === true);
    const error = resultError(result, "toggle failed");
    if (error) throw error;
    return { notice: "", application: result?.application || "applied" };
  }
  if (job.op === "import") {
    const names = serverNames(ctx, "");
    let added = 0;
    for (const server of job.servers || []) {
      if (names.includes(String(server.serverName || "").trim())) continue;
      await saveServer(ctx, { ...server, enabled: false, patchId: "" });
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
    const scan = await projectScan([ws], serverNames(ctx, ""));
    const wanted = new Set(Array.isArray(job.names) ? job.names : []);
    let added = 0;
    for (const file of scan[0].files) {
      for (const row of file.rows) {
        if (row.skip || !wanted.has(row.name)) continue;
        await saveServer(ctx, { ...row.server, enabled: false, patchId: "" }, { scope: "project", workspace: ws.path, file: file.file });
        added += 1;
      }
    }
    return { notice: "approved", noticeParams: { count: added }, application: "" };
  }
  throw new CodedError("badRequest");
}

function json(value, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export function apply(ctx) {
  const listWorkspaces = workspaceSource(ctx);
  let busy = Promise.resolve();

  async function state() {
    const list = await servers(ctx);
    const workspaces = await listWorkspaces();
    const project = await projectScan(workspaces, list.map((item) => item.serverName));
    return { servers: list, project: publicProject(project), templates: model.TEMPLATES.map((t) => ({ id: t.id, transport: t.transport })) };
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: STATE_PATH,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => {
      try {
        return json(await state());
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
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
      // Serialize writes: two pnpm runs or two patch edits must not interleave.
      const run = busy.then(() => runJob(ctx, job, listWorkspaces));
      busy = run.catch(() => {});
      try {
        const result = await run;
        return json({ ok: true, ...result, state: await state() });
      } catch (error) {
        const coded = error instanceof CodedError;
        let snapshot = null;
        try { snapshot = await state(); } catch {}
        return json({ ok: false, code: coded ? error.code : "", params: coded ? error.params : {}, message: error instanceof Error ? error.message : String(error), state: snapshot }, coded ? 400 : 500);
      }
    },
  }), "dsh-mcp-manager: action route");
}
