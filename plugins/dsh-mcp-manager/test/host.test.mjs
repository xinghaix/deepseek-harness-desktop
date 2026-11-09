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
    ...restored.servers[0], serverName: "persisted-renamed", args: ["changed.js"], env: restored.servers[0].env.map((row) => ({ ...row, keep: true })),
  } });
  assert.equal(edited.ok, true, edited.message);
  assert.equal(edited.state.servers[0].serverName, "persisted-renamed");
  assert.equal(edited.state.servers[0].patchId, first.patchId);
  assert.doesNotMatch(JSON.stringify(edited), /test-private-value/);

  // 保存自定义调用提示词并验证 tools/post-execute 按需注入与同批次去重
  const withPrompt = await h.action({ op: "save", server: {
    ...edited.state.servers[0],
    prompt: "当前为只读权限，禁止执行写操作",
    env: edited.state.servers[0].env.map((row) => ({ ...row, keep: true })),
  } });
  assert.equal(withPrompt.ok, true, withPrompt.message);
  assert.equal(withPrompt.state.servers[0].prompt, "当前为只读权限，禁止执行写操作");

  const decision1 = await h.ctx.waterfall(
    h.ctx.tools,
    "tools/post-execute",
    { callId: "call-1", rootCallId: "batch-1", name: "mcp__persisted-renamed__run_query" },
    { isError: false },
    () => Promise.resolve({ kind: "accept" }),
  );
  assert.equal(decision1.additionalContexts?.length, 1);
  assert.equal(decision1.additionalContexts[0].role, "user");
  assert.deepEqual(decision1.additionalContexts[0].source, {
    kind: "plugin:dsh-mcp-manager",
    form: "instructions",
  });
  assert.match(decision1.additionalContexts[0].content[0].text, /\[MCP:persisted-renamed\]/);
  assert.match(decision1.additionalContexts[0].content[0].text, /当前为只读权限，禁止执行写操作/);

  // 同一批次（相同 rootCallId）再次调用该 MCP 的其它工具不会重复注入
  const decisionDup = await h.ctx.waterfall(
    h.ctx.tools,
    "tools/post-execute",
    { callId: "call-2", rootCallId: "batch-1", name: "mcp__persisted-renamed__list_tables" },
    { isError: false },
    () => Promise.resolve({ kind: "accept" }),
  );
  assert.equal(decisionDup.additionalContexts, undefined);

  // 新批次（不同 rootCallId）再次调用时会注入，非 MCP 工具不注入
  const decisionNewBatch = await h.ctx.waterfall(
    h.ctx.tools,
    "tools/post-execute",
    { callId: "call-3", rootCallId: "batch-2", name: "mcp__persisted-renamed__run_query" },
    { isError: false },
    () => Promise.resolve({ kind: "accept" }),
  );
  assert.equal(decisionNewBatch.additionalContexts?.length, 1);

  const decisionNonMcp = await h.ctx.waterfall(
    h.ctx.tools,
    "tools/post-execute",
    { callId: "call-4", rootCallId: "batch-3", name: "bash" },
    { isError: false },
    () => Promise.resolve({ kind: "accept" }),
  );
  assert.equal(decisionNonMcp.additionalContexts, undefined);

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

