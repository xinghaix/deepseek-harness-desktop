import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { EntryTree } from "@deepseek-ai/cordis-plugin-loader";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import model from "./model.cjs";

const connectionRecordSchema = {
  parse(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid connection record");
    if (typeof raw.id !== "string" || !/^dsh-mcp-[A-Za-z0-9_-]+$/.test(raw.id)) throw new Error("invalid connection id");
    if (!raw.config || typeof raw.config !== "object" || Array.isArray(raw.config)) throw new Error("invalid connection config");
    if (typeof raw.enabled !== "boolean") throw new Error("invalid connection enabled");
    const out = {
      id: raw.id,
      config: { ...raw.config },
      enabled: raw.enabled,
    };
    if (raw.origin !== undefined) {
      if (!raw.origin || typeof raw.origin !== "object" || raw.origin.scope !== "project" || typeof raw.origin.workspace !== "string" || typeof raw.origin.file !== "string") {
        throw new Error("invalid connection origin");
      }
      out.origin = { scope: "project", workspace: raw.origin.workspace, file: raw.origin.file };
    }
    if (raw.legacy !== undefined) {
      if (!raw.legacy || typeof raw.legacy !== "object" || typeof raw.legacy.bundleName !== "string" || typeof raw.legacy.patchId !== "string" || typeof raw.legacy.pending !== "boolean") {
        throw new Error("invalid connection legacy");
      }
      out.legacy = { bundleName: raw.legacy.bundleName, patchId: raw.legacy.patchId, pending: raw.legacy.pending };
    }
    return out;
  },
};

// 单独的数据域按 profile 隔离；不把凭据复制进 profile patch 或 desktop-state。
export function connectionDomain(profilePath) {
  return defineDomain({
    name: "mcp_manager_" + createHash("sha256").update(resolve(profilePath)).digest("hex").slice(0, 16),
    version: 1,
    layout: "per-record",
    invalidRecords: "backup-and-skip",
    tables: {
      connections: domainTable(connectionRecordSchema),
    },
  });
}

export function resolveConnectionConfig(config, env = process.env) {
  const next = structuredClone(config);
  // 仅识别旧包生成的环境变量引用，绝不 eval 任意 !!js 表达式。
  for (const key of ["env", "headers"]) {
    if (!next[key]) continue;
    next[key] = Object.fromEntries(Object.entries(next[key]).flatMap(([name, value]) => {
      if (typeof value === "string") return [[name, value]];
      const match = /^process\.env\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(value?.__jsExpr || "");
      if (!match) throw new Error("不支持的 MCP 凭据引用");
      return env[match[1]] === undefined ? [] : [[name, env[match[1]]]];
    }));
  }
  const rejectExpressions = (value) => {
    if (!value || typeof value !== "object") return;
    if ("__jsExpr" in value) throw new Error("不支持的 MCP 配置表达式");
    for (const item of Object.values(value)) rejectExpressions(item);
  };
  rejectExpressions(next);
  return next;
}

export function connectionConfig(server, current = {}) {
  const serverName = String(server.serverName ?? "").trim();
  const issue = model.nameIssue(serverName, []);
  if (issue) throw new Error(model.nameMessage(issue, serverName));
  if (model.hasPlaceholder(server)) throw new Error("请先替换模板里的 <占位符>。");
  const config = { ...current, serverName, transport: server.transport === "streamable-http" ? "streamable-http" : "stdio" };
  config.toolCallTimeoutMs = model.normalizeTimeoutMs(server.toolCallTimeoutMs);
  if (config.transport === "stdio") {
    if (!String(server.command || "").trim()) throw new Error("stdio 需要 command。");
    if (!Array.isArray(server.args || []) || (server.args || []).some((arg) => typeof arg !== "string")) throw new Error("args 必须是字符串数组。");
    config.command = server.command;
    config.args = server.args || [];
    config.cwd = server.cwd || "";
    config.env = model.mergeSecrets(current.env, server.env);
    delete config.url;
    delete config.headers;
  } else {
    config.url = server.url === model.maskUrl(current.url || "") ? current.url : server.url;
    const url = new URL(config.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("MCP URL 必须使用 http 或 https。");
    config.headers = model.mergeSecrets(current.headers, server.headers);
    delete config.command;
    delete config.args;
    delete config.cwd;
    delete config.env;
  }
  return config;
}

// 私有子树复用官方 Loader，但 write 不落盘。实例属于管理器的上下文，停用时统一等待销毁。
class ConnectionTree extends EntryTree {
  write() {}
  async import(name) {
    try {
      return await super.import(name);
    } catch (error) {
      if (name === model.MCP_CLIENT) return await import("@deepseek-ai/dsh-mcp-client");
      throw error;
    }
  }
}

export class ConnectionRuntime {
  constructor(ctx, { startupTimeoutMs = 15000, tree = new ConnectionTree(ctx) } = {}) {
    this.tree = tree;
    this.startupTimeoutMs = startupTimeoutMs;
    this.closed = false;
    this.pending = new Set();
  }

  entry(id) {
    try { return this.tree.resolve(id); } catch { return null; }
  }

  async remove(id) {
    const entry = this.entry(id);
    if (!entry) return;
    // EntryTree.remove() 不 await fiber.dispose()；先等待 transport 和工具释放再移除，避免重连重叠。
    if (entry.fiber) await entry.fiber.dispose();
    this.tree.remove(id);
  }

  async put(record) {
    const task = this.start(record);
    this.pending.add(task);
    try { return await task; }
    finally { this.pending.delete(task); }
  }

  async start(record) {
    if (this.closed) throw new Error("MCP 管理器已停止");
    await this.remove(record.id);
    if (this.closed) throw new Error("MCP 管理器已停止");
    const config = resolveConnectionConfig(record.config);
    config.failOnStartupError = true;
    const creating = this.tree.create({ id: record.id, name: model.MCP_CLIENT, config, disabled: !record.enabled });
    const entry = this.entry(record.id);
    await creating;
    if (this.closed) {
      if (entry?.fiber) await entry.fiber.dispose();
      await this.remove(record.id);
      throw new Error("MCP 管理器已停止");
    }
    if (!record.enabled) return;
    if (!entry?.fiber) {
      await this.remove(record.id);
      throw new Error("MCP 客户端未能加载");
    }
    let timer;
    let timedOut = false;
    const ready = entry.fiber.await();
    try {
      // 超时不是遗弃 fiber：下方 finally 会等待取消与 transport 回收，再允许下一次操作。
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error("MCP 连接启动超时"));
          }, this.startupTimeoutMs);
        }),
      ]);
      if (this.closed) throw new Error("MCP 管理器已停止");
      if (entry.fiber.state !== 2) {
        const rawErr = entry.fiber._error;
        const detail = rawErr?.cause?.message || rawErr?.message || "";
        throw new Error(detail ? `MCP 连接或工具发现失败: ${detail}` : "MCP 连接或工具发现失败");
      }
    } catch (error) {
      await this.remove(record.id);
      throw error;
    } finally {
      clearTimeout(timer);
      if (timedOut) await ready.catch(() => {});
    }
  }

  async close() {
    this.closed = true;
    await Promise.all(Object.values(this.tree.store).map((entry) => this.remove(entry.options.id)));
    await Promise.allSettled([...this.pending]);
    await Promise.all(Object.values(this.tree.store).map((entry) => this.remove(entry.options.id)));
  }
}

function parseYamlScalar(raw) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.startsWith("!!js ")) return { __jsExpr: trimmed.slice(5).trim() };
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "[]") return [];
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('"')) return JSON.parse(trimmed);
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replace(/''/g, "'");
  return trimmed;
}

function parseLegacyPatch(patchText) {
  const lines = String(patchText || "").replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "" && !/^\s*#/.test(line));
  if (lines[0] !== "- insert:") throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
  const row = { config: {} };
  let section = "";
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const topMatch = /^(?: {4}- | {6})(id|name|disabled|config):(?:\s*(.*))?$/.exec(line);
    if (topMatch) {
      section = "";
      const [, key, rest = ""] = topMatch;
      if (key === "config") {
        if (rest.trim() !== "") throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
        section = "config";
      } else {
        row[key] = parseYamlScalar(rest);
      }
      continue;
    }
    const cfgMatch = /^ {8}([A-Za-z_][A-Za-z0-9_]*):(?:\s*(.*))?$/.exec(line);
    if (cfgMatch) {
      const [, key, rest = ""] = cfgMatch;
      if (rest.trim() === "") {
        if (key === "args") {
          row.config.args = [];
          section = "args";
        } else if (key === "env" || key === "headers") {
          row.config[key] = {};
          section = key;
        } else {
          throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
        }
      } else {
        section = "config";
        row.config[key] = parseYamlScalar(rest);
      }
      continue;
    }
    if (section === "args") {
      const argMatch = /^ {10}- (.*)$/.exec(line);
      if (!argMatch) throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
      row.config.args.push(parseYamlScalar(argMatch[1]));
      continue;
    }
    if (section === "env" || section === "headers") {
      const kvMatch = /^ {10}("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
      if (!kvMatch) throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
      const k = kvMatch[1].startsWith('"') ? JSON.parse(kvMatch[1]) : kvMatch[1];
      row.config[section][k] = parseYamlScalar(kvMatch[2]);
      continue;
    }
    throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
  }
  return [{ insert: [row] }];
}

export async function readLegacyConnection(profilePath, bundle) {
  const serverName = bundle.name.slice("@local/dsh-mcp-".length);
  if (!model.NAME_RE.test(serverName)) throw new Error("旧 MCP 配置包名称无效");
  const dir = join(profilePath, "mcp-bundles", serverName);
  const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  // 不凭 @local 前缀接管用户包；必须符合旧管理器的完整配置包结构。
  if (pkg.name !== bundle.name || pkg.private !== true || pkg.version !== "1.0.0" || pkg.dsh?.bundle?.patch !== "./cordis.patch.yml" ||
      pkg.description !== `MCP server (${serverName} · stdio)` && pkg.description !== `MCP server (${serverName} · streamable-http)`) {
    throw new Error("不是本管理器创建的 MCP 配置包");
  }
  const patch = parseLegacyPatch(await readFile(join(dir, "cordis.patch.yml"), "utf8"));
  const row = patch?.[0]?.insert?.[0];
  if (!Array.isArray(patch) || patch.length !== 1 || Object.keys(patch[0]).length !== 1 || patch[0].insert.length !== 1 ||
      row?.name !== model.MCP_CLIENT || !String(row.id || "").startsWith("dsh-mcp-" + serverName) || row.config?.serverName !== serverName) {
    throw new Error("旧 MCP 配置包包含无法自动迁移的条目");
  }
  resolveConnectionConfig(row.config);
  return {
    id: row.id,
    config: row.config,
    enabled: bundle.enabled !== false && row.disabled !== true,
    ...(pkg.dshMcpManager?.origin ? { origin: pkg.dshMcpManager.origin } : {}),
    legacy: { bundleName: bundle.name, patchId: row.id, pending: true },
  };
}

function assertApplied(result) {
  if (result?.error || result?.application !== "applied") throw new Error("旧 MCP 配置包未能应用变更");
}

export class Connections {
  constructor(ctx, domain, runtime, profilePath) {
    this.ctx = ctx;
    this.domain = domain;
    this.table = domain.tables.get("connections");
    this.runtime = runtime;
    this.profilePath = profilePath;
    this.errors = new Map();
    this.migrationErrors = new Map();
    this.legacyNames = new Set();
  }

  records() {
    return [...this.table.entries()].map(([, record]) => record);
  }

  get(id) {
    return this.table.get(id);
  }

  async restore(record) {
    try {
      await this.runtime.put(record);
      this.errors.delete(record.id);
    } catch (error) {
      this.errors.set(record.id, model.redactText(String(error.message || error)));
    }
  }

  async save(server, origin) {
    const old = server.patchId ? this.get(server.patchId) : null;
    if (server.patchId && (!old || old.legacy?.pending)) throw new Error("连接已变更，请刷新后重试");
    if (old && old.config.serverName !== String(server.serverName).trim()) throw new Error(model.nameMessage("taken", server.serverName));
    const record = {
      ...(old || {}),
      id: old?.id || "dsh-mcp-" + randomUUID(),
      config: connectionConfig(server, old?.config),
      enabled: old ? old.enabled : server.enabled === true,
      ...(origin ? { origin } : {}),
    };
    await this.table.put(record.id, record);
    try {
      await this.runtime.put(record);
      this.errors.delete(record.id);
    } catch (error) {
      // 新建或编辑后的连接启动失败时保留已持久化的新配置，方便用户修正参数或稍后重连，不丢弃刚保存的改动。
      this.errors.set(record.id, model.redactText(String(error.message || error)));
      throw error;
    }
    return "applied";
  }

  async setEnabled(record, enabled) {
    const next = { ...record, enabled };
    await this.table.put(record.id, next);
    await this.restore(next);
    if (enabled && this.errors.has(record.id)) throw new Error(this.errors.get(record.id));
    return "applied";
  }

  async remove(record) {
    await this.runtime.remove(record.id);
    try {
      await this.table.delete(record.id);
    } catch (error) {
      await this.restore(record);
      throw error;
    }
    this.errors.delete(record.id);
  }

  async migrate(bundle, plugins) {
    const source = await readLegacyConnection(this.profilePath, bundle);
    this.legacyNames.add(bundle.name);
    const plugin = plugins.find((row) => row.patchId === source.legacy.patchId && row.moduleName === model.MCP_CLIENT);
    const existing = this.records().find((record) => record.legacy?.bundleName === bundle.name);
    // 若旧包处于启用态但找不到对应插件行，且无已落盘的 pending 记录，则不盲目卸载；若旧包本身已在插件页停用（bundle.enabled === false），可直接按停用态迁移。
    if (!plugin && bundle.enabled !== false && !existing?.legacy?.pending) throw new Error("无法定位旧 MCP 连接，保留原配置包");
    const actual = [...(this.ctx.loader?.entries() || [])].find((entry) => entry.options.id === source.legacy.patchId && entry.options.name === model.MCP_CLIENT);
    if (actual) {
      source.config = structuredClone(actual.options.config);
      if (source.config.serverName !== source.config.serverName.trim() || source.config.serverName !== bundle.name.slice("@local/dsh-mcp-".length)) throw new Error("旧 MCP 名称已被外部配置覆盖");
      resolveConnectionConfig(source.config);
    }
    // 新运行时不能复用旧包的 rowId，否则官方 removeBundle 会把它误判为仍在使用旧包。
    source.id = existing?.id || "dsh-mcp-" + randomUUID();
    // pending 记录保存停旧之前的启用状态，崩溃重试时不采纳迁移写入的临时 disabled。
    source.enabled = existing?.legacy?.pending ? existing.enabled : (bundle.enabled !== false && plugin?.enabled === true);
    await this.table.put(source.id, source);
    try {
      if (plugin) assertApplied(await this.ctx.pluginManager.setPluginEnabled(plugin.entryId, false));
      await this.runtime.put(source);
      assertApplied(await this.ctx.pluginManager.removeBundle(bundle.name));
      const remains = (await this.ctx.pluginManager.listBundles()).some((row) => row.name === bundle.name && (row.installed || row.enabled));
      if (remains) throw new Error("旧 MCP 配置包尚未移除");
      await this.table.put(source.id, { ...source, legacy: { ...source.legacy, pending: false } });
      this.errors.delete(source.id);
      this.migrationErrors.delete(bundle.name);
      // 保留旧目录原文作为回退副本；它已不在 profile 包清单中，不再加载。
    } catch (error) {
      await this.runtime.remove(source.id);
      const remains = (await this.ctx.pluginManager.listBundles()).some((row) => row.name === bundle.name && (row.installed || row.enabled));
      if (remains && plugin && !this.runtime.closed) assertApplied(await this.ctx.pluginManager.setPluginEnabled(plugin.entryId, source.enabled));
      throw error;
    }
  }

  async initialize() {
    // 先恢复已完成的自有连接记录，避免正常 MCP 工具注册被慢速的旧包卸载阻塞。
    const restored = new Set();
    for (const record of this.records()) {
      if (record.legacy?.pending) continue;
      restored.add(record.id);
      await this.restore(record);
    }
    const [bundles, plugins] = await Promise.all([this.ctx.pluginManager.listBundles(), this.ctx.pluginManager.listPlugins()]);
    const legacy = bundles.filter((bundle) => bundle.installed && bundle.name.startsWith("@local/dsh-mcp-"));
    const attempted = new Set();
    for (const bundle of legacy) {
      attempted.add(bundle.name);
      try {
        await this.migrate(bundle, plugins);
      } catch (error) {
        this.migrationErrors.set(bundle.name, model.redactText(String(error.message || error)));
      }
    }
    const current = legacy.length || this.records().some((r) => r.legacy?.pending) ? await this.ctx.pluginManager.listBundles() : bundles;
    for (const record of this.records()) {
      if (restored.has(record.id) || attempted.has(record.legacy?.bundleName)) continue;
      if (record.legacy?.pending) {
        // 崩溃发生在移除旧包之后：源包已不存在时以已持久化记录恢复，不重新安装旧包。
        if (current.some((bundle) => bundle.name === record.legacy.bundleName && (bundle.installed || bundle.enabled))) continue;
        await this.table.put(record.id, { ...record, legacy: { ...record.legacy, pending: false } });
      }
      await this.restore(record);
    }
  }

  async close() {
    await this.runtime.close();
    await this.domain.close();
  }
}
