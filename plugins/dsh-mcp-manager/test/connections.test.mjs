import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { Connections, ConnectionRuntime, connectionConfig, connectionDomain, readLegacyConnection, resolveConnectionConfig } from "../lib/connections.js";
import model from "../lib/model.cjs";

export function memoryDomain(profile = "/test/profile") {
  const values = new Map();
  const schema = connectionDomain(profile).tables.connections.valueSchema;
  const table = {
    get: (id) => values.get(id),
    entries: () => values.entries(),
    async put(id, record) { values.set(id, schema.parse(structuredClone(record))); },
    async delete(id) { return values.delete(id); },
  };
  return { tables: new Map([["connections", table]]), close: async () => {}, table };
}

function fakeRuntime(events = []) {
  const active = new Map();
  return {
    active,
    fail: false,
    entry: (id) => active.has(id) ? { fiber: { state: 2 } } : null,
    async put(record) {
      events.push(["put", record.id, record.enabled]);
      if (record.enabled && events.some((event) => event[0] === "legacy-enable")) {
        assert.equal(events.filter((event) => event[0] === "legacy-enable").at(-1)[1], false);
      }
      if (this.fail) throw new Error("connection failed Bearer secret-value");
      active.set(record.id, record);
    },
    async remove(id) { events.push(["remove", id]); active.delete(id); },
    async close() { active.clear(); },
  };
}

async function legacyFixture(t, { enabled = true, server = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "dsh-mcp-migration-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = model.bundleFiles({
    serverName: "alpha", command: "node", args: ["server.js", "path with spaces"], cwd: "/workspace", enabled,
    env: [{ name: "TOKEN", ref: "ALPHA_TOKEN" }, { name: "LITERAL", value: "literal-secret" }],
    toolCallTimeoutMs: 120000, ...server,
  }, { scope: "project", workspace: "/workspace", file: ".dsh/mcp.json" }, "a1");
  const bundleDir = join(dir, "mcp-bundles", "alpha");
  await mkdir(bundleDir, { recursive: true });
  await writeFile(join(bundleDir, "package.json"), files.packageJson);
  await writeFile(join(bundleDir, "cordis.patch.yml"), files.patch);
  const events = [];
  const runtime = fakeRuntime(events);
  const bundle = { name: files.packageName, installed: true, enabled: true };
  const plugin = { patchId: files.rowId, moduleName: model.MCP_CLIENT, entryId: "include:" + files.rowId, enabled };
  let installed = true;
  let removalFails = false;
  const domain = memoryDomain(dir);
  const manager = new Connections({
    pluginManager: {
      listBundles: async () => installed ? [bundle] : [],
      listPlugins: async () => installed ? [plugin] : [],
      async setPluginEnabled(id, value) {
        assert.equal(id, plugin.entryId);
        if (value) assert.equal(runtime.active.size, 0, "旧连接恢复之前必须释放新实例");
        events.push(["legacy-enable", value]);
        plugin.enabled = value;
        return { application: "applied" };
      },
      async removeBundle(name) {
        assert.equal(name, bundle.name);
        if (removalFails) return { error: { code: "remove-failed" } };
        events.push(["remove-bundle", name]);
        installed = false;
        return { application: "applied" };
      },
    },
  }, domain, runtime, dir);
  return { manager, runtime, domain, dir, files, plugin, bundle, events, setRemovalFails: () => { removalFails = true; } };
}

test("连接数据域按 profile 隔离，配置编辑保留引用、URL 原文和额外官方选项", () => {
  assert.notEqual(connectionDomain("/profiles/a").name, connectionDomain("/profiles/b").name);
  const before = { transport: "streamable-http", serverName: "remote", url: "https://example.test/mcp?token=private", headers: { Authorization: { __jsExpr: "process.env.API_TOKEN" } }, reconnect: { enabled: false } };
  const config = connectionConfig({ serverName: "remote", transport: "streamable-http", url: model.maskUrl(before.url), headers: [{ name: "Authorization", keep: true }], toolCallTimeoutMs: 1234 }, before);
  assert.equal(config.url, before.url);
  assert.deepEqual(config.headers, before.headers);
  assert.deepEqual(config.reconnect, before.reconnect);
  assert.equal(config.toolCallTimeoutMs, 1234);
  assert.deepEqual(resolveConnectionConfig(config, { API_TOKEN: "resolved-secret" }).headers, { Authorization: "resolved-secret" });
  assert.deepEqual(config.headers, before.headers, "解析不能把凭据明文写回记录");
  assert.throws(() => resolveConnectionConfig({ env: { X: { __jsExpr: "process.exit()" } } }), /不支持/);
});

test("新连接增删改、启停、恢复不安装任何 Bundle；删除后重建不继承启用状态", async () => {
  const domain = memoryDomain();
  const runtime = fakeRuntime();
  const manager = new Connections({ pluginManager: { listBundles: async () => [], listPlugins: async () => [] } }, domain, runtime, "/test/profile");
  await manager.save({ serverName: "alpha", command: "node", args: [] });
  const old = manager.records()[0];
  assert.equal(old.enabled, false);
  await manager.setEnabled(old, true);
  assert.equal(manager.get(old.id).enabled, true);
  await manager.save({ patchId: old.id, serverName: "alpha", command: "node", args: ["new.js"] });
  assert.deepEqual(manager.get(old.id).config.args, ["new.js"]);
  await manager.remove(manager.get(old.id));
  await manager.save({ serverName: "alpha", command: "node", args: [] });
  assert.notEqual(manager.records()[0].id, old.id);
  assert.equal(manager.records()[0].enabled, false);
  await manager.close();
  assert.equal(runtime.active.size, 0);
});

test("旧 Bundle 迁移先持久化再停旧启新，保留凭据引用、参数、来源、超时和备份文件", async (t) => {
  const f = await legacyFixture(t);
  await f.manager.initialize();
  assert.equal(f.manager.migrationErrors.size, 0);
  const record = f.manager.records()[0];
  assert.equal(record.enabled, true);
  assert.equal(record.legacy.pending, false);
  assert.deepEqual(record.config.env, { TOKEN: { __jsExpr: "process.env.ALPHA_TOKEN" }, LITERAL: "literal-secret" });
  assert.equal(record.config.toolCallTimeoutMs, 120000);
  assert.deepEqual(record.config.args, ["server.js", "path with spaces"]);
  assert.equal(record.origin.workspace, "/workspace");
  assert.deepEqual(f.events, [["legacy-enable", false], ["put", record.id, true], ["remove-bundle", f.bundle.name]]);
  assert.equal(await readFile(join(f.dir, "mcp-bundles/alpha/cordis.patch.yml"), "utf8"), f.files.patch);
  f.events.length = 0;
  await f.manager.initialize();
  assert.deepEqual(f.events, [["put", record.id, true]], "重复加载只恢复已迁移记录");
});

test("失败迁移回收新实例并恢复旧连接，下一次启动仍保留迁移前的启用状态", async (t) => {
  const f = await legacyFixture(t);
  f.runtime.fail = true;
  await f.manager.initialize();
  assert.equal(f.manager.migrationErrors.size, 1);
  assert.equal(f.plugin.enabled, true);
  assert.equal(f.manager.records()[0].legacy.pending, true);
  assert.doesNotMatch(JSON.stringify([...f.manager.migrationErrors]), /secret-value/);
  f.runtime.fail = false;
  // 模拟在持久化停用旧条目之后崩溃，不能把临时 disabled 状态当作用户偏好。
  f.plugin.enabled = false;
  await f.manager.initialize();
  assert.equal(f.manager.records()[0].enabled, true);
  assert.equal(f.manager.records()[0].legacy.pending, false);
});

test("移除旧包失败时回滚到旧连接；持久化失败时不动运行中的旧包", async (t) => {
  const f = await legacyFixture(t);
  f.setRemovalFails();
  await f.manager.initialize();
  assert.equal(f.plugin.enabled, true);
  assert.equal(f.runtime.active.size, 0);
  assert.equal(f.manager.migrationErrors.size, 1);
  const g = await legacyFixture(t);
  g.domain.table.put = async () => { throw new Error("disk full"); };
  await g.manager.initialize();
  assert.deepEqual(g.events, []);
  assert.equal(g.plugin.enabled, true);
});

test("停用的旧 MCP 不会在迁移时启动；HTTP URL 查询和 headers 原样迁移；插件页被整体停用的旧包也可迁移", async (t) => {
  const f = await legacyFixture(t, { enabled: false, server: { transport: "streamable-http", url: "https://example.test/mcp?token=raw", headers: [{ name: "Authorization", ref: "HTTP_TOKEN" }] } });
  await f.manager.initialize();
  const record = f.manager.records()[0];
  assert.equal(record.enabled, false);
  assert.equal(record.config.url, "https://example.test/mcp?token=raw");
  assert.deepEqual(record.config.headers, { Authorization: { __jsExpr: "process.env.HTTP_TOKEN" } });
  assert.equal(f.events.some((e) => e[0] === "put" && e[2]), false);

  const g = await legacyFixture(t, { enabled: true });
  g.bundle.enabled = false;
  g.manager.ctx.pluginManager.listPlugins = async () => [];
  await g.manager.initialize();
  assert.equal(g.manager.migrationErrors.size, 0);
  assert.equal(g.manager.records().length, 1);
  assert.equal(g.manager.records()[0].enabled, false);
});

test("编辑已有连接但重连失败时保留用户最新保存的配置并记录脱敏错误", async () => {
  const domain = memoryDomain();
  const runtime = fakeRuntime();
  const manager = new Connections({ pluginManager: { listBundles: async () => [], listPlugins: async () => [] } }, domain, runtime, "/test/profile");
  await manager.save({ serverName: "alpha", command: "node", args: ["old.js"], enabled: true });
  const saved = manager.records()[0];
  runtime.fail = true;
  await assert.rejects(
    manager.save({ patchId: saved.id, serverName: "alpha", command: "node", args: ["fixed.js"] }),
    /connection failed/,
  );
  assert.deepEqual(manager.get(saved.id).config.args, ["fixed.js"], "编辑后的新配置不应被回滚丢弃");
  assert.doesNotMatch(manager.errors.get(saved.id) || "", /secret-value/);
});

test("伪装成旧包的外部配置与任意 !!js 表达式不被自动接管", async (t) => {
  const f = await legacyFixture(t);
  await writeFile(join(f.dir, "mcp-bundles/alpha/package.json"), JSON.stringify({ name: f.bundle.name, private: true }));
  await f.manager.initialize();
  assert.equal(f.manager.records().length, 0);
  assert.deepEqual(f.events, []);
  const g = await legacyFixture(t);
  await writeFile(join(g.dir, "mcp-bundles/alpha/cordis.patch.yml"), g.files.patch.replace("process.env.ALPHA_TOKEN", "process.exit()"));
  await assert.rejects(readLegacyConnection(g.dir, g.bundle), /不支持/);
});

test("真实 Loader 子树在重连前 await 旧 fiber 的异步销毁，管理器关闭不触碰外部插件", async () => {
  const root = new Context();
  await root.plugin(Loader);
  let runtime;
  let active = 0;
  let externalDisposed = false;
  const calls = [];
  const owner = root.plugin({
    inject: ["loader"],
    async apply(ctx) {
      runtime = new ConnectionRuntime(ctx);
      ctx.effect(() => () => runtime.close());
    },
  });
  await owner;
  const external = root.plugin({ async apply(ctx) { ctx.effect(() => () => { externalDisposed = true; }); } });
  await external;
  runtime.tree.import = async () => ({
    async apply(ctx) {
      active += 1;
      assert.equal(active, 1);
      calls.push("start");
      ctx.effect(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        calls.push("stop");
      });
    },
  });
  const record = { id: "dsh-mcp-owned", config: { serverName: "alpha", command: "node", transport: "stdio" }, enabled: true };
  await runtime.put(record);
  await runtime.put(record);
  assert.deepEqual(calls, ["start", "stop", "start"]);
  await owner.dispose();
  assert.equal(active, 0);
  assert.equal(externalDisposed, false);
  assert.equal(Object.keys(runtime.tree.store).length, 0);
  await root.fiber.dispose();
});

test("启动超时会取消并等待 Loader fiber，后续连接仍可使用同一个运行时", async () => {
  const root = new Context();
  await root.plugin(Loader);
  let runtime;
  const owner = root.plugin({ inject: ["loader"], async apply(ctx) { runtime = new ConnectionRuntime(ctx, { startupTimeoutMs: 10 }); ctx.effect(() => () => runtime.close()); } });
  await owner;
  let closed = false;
  runtime.tree.import = async () => ({ async apply(ctx) {
    await new Promise((resolve) => {
      ctx.on("internal/plugin", (fiber) => {
        if (fiber === ctx.fiber && fiber.uid === null) { closed = true; resolve(); }
      }, { global: true });
    });
  } });
  const record = { id: "dsh-mcp-hang", config: { serverName: "hang" }, enabled: true };
  await assert.rejects(runtime.put(record), /超时/);
  assert.equal(closed, true);
  assert.equal(runtime.entry(record.id), null);
  runtime.tree.import = async () => ({ async apply() {} });
  await runtime.put(record);
  await root.fiber.dispose();
});


test("真实官方 MCP 客户端可发现工具、重连、关闭子进程，启动超时不遗留进程", { timeout: 10000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-mcp-runtime-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = new Context();
  await root.plugin(Loader);
  t.after(() => root.fiber.dispose());
  const tools = new Map();
  root.provide("tools", {
    register(definition) {
      assert.equal(tools.has(definition.name), false);
      tools.set(definition.name, definition);
      return () => tools.delete(definition.name);
    },
  });
  let runtime;
  const owner = root.plugin({ inject: ["loader"], async apply(ctx) {
    runtime = new ConnectionRuntime(ctx, { startupTimeoutMs: 3000 });
    ctx.effect(() => () => runtime.close());
  } });
  await owner;
  runtime.tree.import = async () => mcpClient;
  const pidFile = join(dir, "child.pid");
  const script = fileURLToPath(new URL("./fixtures/mcp-server.cjs", import.meta.url));
  const record = { id: "dsh-mcp-protocol", enabled: true, config: { serverName: "test_server", transport: "stdio", command: process.execPath, args: [script, pidFile], cwd: dir } };
  await runtime.put(record);
  assert.equal(tools.has("mcp__test_server__echo"), true);
  const first = Number(await readFile(pidFile, "utf8"));
  await runtime.put(record);
  assert.throws(() => process.kill(first, 0), { code: "ESRCH" });
  const second = Number(await readFile(pidFile, "utf8"));
  assert.notEqual(second, first);
  await owner.dispose();
  assert.equal(tools.size, 0);
  assert.throws(() => process.kill(second, 0), { code: "ESRCH" });

  let hanging;
  const owner2 = root.plugin({ inject: ["loader"], async apply(ctx) {
    hanging = new ConnectionRuntime(ctx, { startupTimeoutMs: 800 });
    ctx.effect(() => () => hanging.close());
  } });
  await owner2;
  hanging.tree.import = async () => mcpClient;
  await rm(pidFile);
  await assert.rejects(hanging.put({ ...record, config: { ...record.config, args: [script, pidFile, "--silent"] } }), /超时/);
  const silentPid = Number(await readFile(pidFile, "utf8"));
  assert.throws(() => process.kill(silentPid, 0), { code: "ESRCH" });
  await owner2.dispose();
});
