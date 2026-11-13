import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../lib/store.js";

async function fixture(t, raw = {}) {
  const directory = await mkdtemp(join(tmpdir(), "dhs-store-"));
  t.after(async () => {
    assert.ok(directory.startsWith(join(tmpdir(), "dhs-store-")));
    await rm(directory, { recursive: true });
  });
  const path = join(directory, "config.json");
  await writeFile(path, JSON.stringify(raw));
  const store = new SettingsStore({ path, env: {}, listWorkspaces: () => [{ id: "ws", path: "/work/project", title: "Project" }], rootOf: async () => "/work/project" });
  return { directory, path, store };
}
test("保存 DSH 总开关不触碰凭据和其它工具，状态不泄漏凭据", async t => {
  const { store, path } = await fixture(t, { apiToken: "private-token", apiUrl: "https://secret.example", harnesses: { codex: { disabled: false } } });
  const state = await store.status();
  assert.ok(!JSON.stringify(state).includes("private-token")); assert.ok(!JSON.stringify(state).includes("secret.example"));
  const result = await store.save({ revision: state.revision, dshEnabled: false });
  assert.equal(result.saved, true); assert.equal(result.status.dshEnabled, false); assert.equal(result.status.changedThisRun, true);
  assert.equal(result.status.runtimeState, "unknown");
  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.apiToken, "private-token"); assert.equal(saved.harnesses.codex.disabled, false);
  if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
});
test("外部更改拒绝覆盖，客户端可重新读取后保存", async t => {
  const { store, path } = await fixture(t);
  const state = await store.status();
  await writeFile(path, '{"apiToken":"external"}');
  await assert.rejects(store.save({ revision: state.revision, dshEnabled: false }), /conflict/);
  assert.equal(await readFile(path, "utf8"), '{"apiToken":"external"}');
  const fresh = await store.status(); await store.save({ revision: fresh.revision, dshEnabled: false });
  assert.equal(JSON.parse(await readFile(path, "utf8")).apiToken, "external");
});
test("并发保存序列化，旧 revision 不覆盖新保存", async t => {
  const { store } = await fixture(t);
  const state = await store.status();
  const results = await Promise.allSettled([store.save({ revision: state.revision, dshEnabled: false }), store.save({ revision: state.revision, dshEnabled: true })]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
});
test("仓库保存必须确认共享影响、匹配 bank 和已登记工作区", async t => {
  const { store } = await fixture(t);
  const state = await store.status("ws");
  const input = { revision: state.revision, workspaceId: "ws", bankId: state.repository.bankId, repositoryPolicy: "disabled" };
  await assert.rejects(store.save(input), /confirmShared/);
  await assert.rejects(store.save({ ...input, confirmShared: true, bankId: "wrong" }), /conflict/);
  await assert.rejects(store.save({ ...input, confirmShared: true, workspaceId: "not-owned" }), /workspaceMissing/);
  const saved = await store.save({ ...input, confirmShared: true });
  assert.equal(saved.status.repository.enabled, false);
  assert.equal(saved.status.repository.reason, "repositoryDisabled");
});
test("无效 JSON、符号链接、超大文件与锁均失败关闭", async t => {
  const { store, path, directory } = await fixture(t);
  await writeFile(path, "{broken");
  await assert.rejects(store.status(), /invalidConfig/);
  await writeFile(path, " ".repeat(1024 * 1024 + 1));
  await assert.rejects(store.status(), /configTooLarge/);
  await writeFile(path, "{}");
  const linked = join(directory, "linked.json"); await symlink(path, linked);
  await assert.rejects(new SettingsStore({ path: linked }).status(), /unsafeConfig/);
  const state = await store.status(); await writeFile(path + ".dsh-hindsight-settings.lock", "");
  await assert.rejects(store.save({ revision: state.revision, dshEnabled: false }), /configBusy/);
});
test("无配置可安全创建；无效仓库不阻塞总开关", async t => {
  const { directory } = await fixture(t);
  const store = new SettingsStore({ path: join(directory, "new", "config.json"), env: {}, rootOf: async () => { throw new Error("missing"); }, listWorkspaces: () => [{ id: "bad", path: "/missing", title: "Missing" }] });
  const state = await store.status("bad");
  assert.equal(state.exists, false); assert.equal(state.repositoryError, "repositoryUnavailable");
  const result = await store.save({ revision: state.revision, workspaceId: "bad", dshEnabled: false });
  assert.equal(result.status.dshEnabled, false);
});
test("无改动不触碰原文件；关闭后拒绝写入", async t => {
  const { store, path } = await fixture(t, { harnesses: { dsh: { disabled: false } } });
  const text = await readFile(path, "utf8"); const state = await store.status();
  assert.equal((await store.save({ revision: state.revision, dshEnabled: true })).saved, false);
  assert.equal(await readFile(path, "utf8"), text);
  await store.close(); await assert.rejects(store.save({ revision: state.revision, dshEnabled: false }), /closing/);
});
test("拒绝未声明字段，不允许自定义文件路径或更改 token", async t => {
  const { store } = await fixture(t); const state = await store.status();
  await assert.rejects(store.save({ revision: state.revision, dshEnabled: false, path: "/other" }), /badRequest/);
  await assert.rejects(store.save({ revision: state.revision, apiToken: "token" }), /badRequest/);
});
