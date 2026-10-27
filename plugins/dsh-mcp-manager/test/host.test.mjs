import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import { JsonStorageBackend } from "@deepseek-ai/dsh-storage-json";
import * as managerPlugin from "../lib/index.js";
import { connectionDomain } from "../lib/connections.js";
import model from "../lib/model.cjs";

async function filesBelow(dir) {
  const files = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isDirectory()) files.push(...await filesBelow(join(dir, item.name)));
    else files.push(join(dir, item.name));
  }
  return files;
}

async function host(t, dir, pluginManager = {}) {
  const ctx = new Context();
  await ctx.plugin(Loader);
  const backend = new JsonStorageBackend(join(dir, "storage"));
  const facility = new DomainFacility({
    storage: { backend: { get: () => backend } },
    emit() {},
  }, { backend: "json" });
  t.after(async () => { await ctx.fiber.dispose(); await facility.closeAll(); await backend.close(); });
  const routes = new Map();
  let schemaCalls = 0;
  ctx.provide("storageDomain", facility);
  ctx.provide("configEditor", { documentPath: join(dir, "profile", "cordis.patch.yml"), entries: () => [] });
  ctx.provide("pluginManager", {
    listBundles: async () => [],
    listPlugins: async () => [],
    installBundle() { assert.fail("新连接不应安装插件包"); },
    setPluginEnabled() { assert.fail("自有连接不应通过插件配置开关控制"); },
    ...pluginManager,
  });
  ctx.provide("tools", { schemas() { schemaCalls += 1; return []; } });
  ctx.provide("workspaceRegistry", { list: () => [] });
  ctx.provide("connection", { fetch: { register(spec) {
    routes.set(spec.path, spec.fetch);
    return () => routes.delete(spec.path);
  } } });
  const owner = ctx.plugin(managerPlugin);
  await owner;
  const state = async () => (await routes.get(managerPlugin.STATE_PATH)()).json();
  const action = async (job) => (await routes.get(managerPlugin.ACTION_PATH)(new Request("http://127.0.0.1" + managerPlugin.ACTION_PATH, {
    method: "POST", body: JSON.stringify(job), headers: { "content-type": "application/json" },
  }))).json();
  return { owner, ctx, facility, state, action, schemaCalls: () => schemaCalls };
}

test("Host 路由使用真实 Cordis 与 JSON 数据域：跨重载持久化，凭据不返回前端，删除不安装包", { timeout: 10000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-mcp-host-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const h = await host(t, dir);
  assert.deepEqual((await h.state()).servers, []);
  const created = await h.action({ op: "save", server: {
    serverName: "persisted", transport: "stdio", command: process.execPath, args: ["path with spaces"],
    env: [{ name: "REF", ref: "MCP_REF" }, { name: "SECRET", value: "test-private-value" }],
    enabled: false, toolCallTimeoutMs: 90000,
  } });
  assert.equal(created.ok, true, created.message);
  assert.equal(created.state.servers.length, 1);
  assert.doesNotMatch(JSON.stringify(created), /test-private-value/);
  const first = created.state.servers[0];
  assert.equal(first.external, false);
  assert.equal(first.pluginEntryId, first.patchId);
  assert.equal(first.bundleName, "");
  assert.equal(first.status, "disabled");
  assert.equal(first.env.find((row) => row.name === "REF").ref, "MCP_REF");
  const record = h.facility.get(connectionDomain(join(dir, "profile")).name).tables.get("connections").get(first.patchId);
  assert.equal(record.config.env.SECRET, "test-private-value");
  assert.deepEqual(record.config.env.REF, { __jsExpr: "process.env.MCP_REF" });
  const files = await filesBelow(join(dir, "storage"));
  assert.ok(files.length > 0);
  if (process.platform !== "win32") {
    for (const file of files) assert.equal((await stat(file)).mode & 0o077, 0, file);
  }
  assert.equal(files.some((file) => file.endsWith("package.json") || file.endsWith("cordis.patch.yml")), false);
  const raw = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("");
  assert.match(raw, /test-private-value/);
  assert.match(raw, /process.env.MCP_REF/);

  await h.owner.dispose();
  h.owner = h.ctx.plugin(managerPlugin);
  await h.owner;
  const restored = await h.state();
  assert.equal(restored.servers[0].patchId, first.patchId);
  assert.equal(restored.servers[0].toolCallTimeoutMs, 90000);
  const edited = await h.action({ op: "save", server: {
    ...restored.servers[0], args: ["changed.js"], env: restored.servers[0].env.map((row) => ({ ...row, keep: true })),
  } });
  assert.equal(edited.ok, true, edited.message);
  assert.doesNotMatch(JSON.stringify(edited), /test-private-value/);
  const deleted = await h.action({ op: "remove", patchId: first.patchId });
  assert.equal(deleted.ok, true, deleted.message);
  assert.deepEqual(deleted.state.servers, []);
  await h.owner.dispose();
});

test("启动后恢复不阻塞自身 fiber 就绪，连续写入串行且重复导入保持唯一", { timeout: 10000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-mcp-queue-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const h = await host(t, dir);
  const job = { op: "import", servers: [{ serverName: "unique", transport: "stdio", command: "node", args: [] }] };
  const results = await Promise.all([h.action(job), h.action(job)]);
  assert.equal(results.every((result) => result.ok), true);
  assert.equal((await h.state()).servers.length, 1);
  assert.equal(h.owner.state, 2);
});

test("迁移旧包时模拟 HMR 等待所有 fiber，不与管理器自身启动互等", { timeout: 10000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dsh-mcp-hmr-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const files = model.bundleFiles({ serverName: "legacy", command: "node", enabled: false }, null, "old");
  const oldDir = join(dir, "profile/mcp-bundles/legacy");
  await mkdir(oldDir, { recursive: true });
  await writeFile(join(oldDir, "package.json"), files.packageJson);
  await writeFile(join(oldDir, "cordis.patch.yml"), files.patch);
  let installed = true;
  let allow;
  const ownerReady = new Promise((resolve) => { allow = resolve; });
  const h = await host(t, dir, {
    listBundles: async () => installed ? [{ name: files.packageName, installed: true, enabled: true }] : [],
    listPlugins: async () => installed ? [{ patchId: files.rowId, entryId: "old-entry", moduleName: model.MCP_CLIENT, enabled: false }] : [],
    async setPluginEnabled(id, value) {
      assert.equal(id, "old-entry");
      assert.equal(value, false);
      const owner = await ownerReady;
      await owner.await();
      return { application: "applied" };
    },
    async removeBundle() { installed = false; return { application: "applied" }; },
  });
  allow(h.owner);
  const state = await h.state();
  assert.deepEqual(state.migrationErrors, []);
  assert.equal(state.servers.length, 1);
  assert.equal(state.servers[0].serverName, "legacy");
  assert.notEqual(state.servers[0].patchId, files.rowId);
  assert.equal(installed, false);
});

