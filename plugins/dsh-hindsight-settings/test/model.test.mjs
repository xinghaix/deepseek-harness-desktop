import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergedConfig, dshEnabled, resolveRepository, updateConfig, repositoryRoot } from "../lib/model.js";

const options = { env: {}, home: "/home/me", rootOf: async () => "/work/project" };
const resolveRepo = (raw, directory = "/work/project/sub") => resolveRepository(raw, directory, options);
test("环境变量、全局、harness 层按顺序合并，保留按键覆盖语义", () => {
  const raw = { disabled: true, banks: { first: { disabled: true }, second: { bank: "shared" } }, harnesses: { dsh: { disabled: false, banks: { first: { retainSessions: false } } } } };
  const cfg = mergedConfig(raw, { HINDSIGHT_DISABLED: "true" });
  assert.equal(dshEnabled(raw, {}), true);
  assert.deepEqual(cfg.banks.first, { retainSessions: false });
  assert.equal(cfg.banks.second.bank, "shared");
  assert.equal(dshEnabled({}, { HINDSIGHT_DISABLED: "yes" }), false);
});
test("默认仓库、静态 bank、模板、路径映射与重定向", async () => {
  assert.equal((await resolveRepo({})).bankId, "coding-agent::project");
  assert.equal((await resolveRepo({ bankId: "fixed" })).bankId, "fixed");
  assert.equal((await resolveRepo({ dynamicBankId: false })).bankId, "coding");
  assert.equal((await resolveRepo({ bankIdTemplate: "{harness}:{project}:{gitProject}:{channel}:{user}" })).bankId, "dsh:sub:project:default:anonymous");
  const result = await resolveRepo({ mapPathToBank: { "/work": "wide", "/work/project": "specific" }, banks: { specific: { bank: "destination", disabled: true } } });
  assert.equal(result.bankId, "specific"); assert.equal(result.destinationBank, "destination"); assert.equal(result.enabled, false);
});
test("DSH 总禁用与 opt-in 不能被 bank 允许绕过", async () => {
  const bank = { "coding-agent::project": { disabled: false } };
  assert.equal((await resolveRepo({ disabled: true, banks: bank })).reason, "dshDisabled");
  assert.equal((await resolveRepo({ optInOnly: true, banks: bank })).reason, "notOptedIn");
  assert.equal((await resolveRepo({ optInOnly: true, optInPaths: ["/work/project"] })).enabled, true);
  assert.equal((await resolveRepo({ optInOnly: true, optInPaths: ["/work/pro"] })).enabled, false);
  assert.equal((await resolveRepo({ optInOnly: true, mapPathToBank: { "/work": "approved" } })).enabled, true);
});
test("路径禁用、bank 允许与继承；harness bank 项整体覆盖", async () => {
  const raw = { paths: { "/work": { disabled: true } } };
  assert.equal((await resolveRepo(raw)).enabled, false);
  const allowed = { ...raw, banks: { "coding-agent::project": { disabled: false } } };
  assert.equal((await resolveRepo(allowed)).enabled, true);
  const overridden = await resolveRepo({ ...allowed, harnesses: { dsh: { banks: { "coding-agent::project": { retainSessions: false } } } } });
  assert.equal(overridden.overridden, true);
  assert.equal(overridden.enabled, false);
  assert.throws(() => updateConfig({}, { repositoryPolicy: "disabled" }, overridden), /repositoryOverridden/);
});
test("只修改明确开关，保留 token、其它 harness、bank 字段", async () => {
  const raw = { apiToken: "secret", harnesses: { other: { disabled: false }, dsh: { autoInject: "recall" } }, banks: { "coding-agent::project": { retainSessions: false, bank: "shared" } } };
  const next = updateConfig(raw, { dshEnabled: false, repositoryPolicy: "disabled" }, await resolveRepo(raw));
  assert.equal(next.apiToken, "secret"); assert.deepEqual(next.harnesses.other, raw.harnesses.other);
  assert.equal(next.harnesses.dsh.autoInject, "recall"); assert.equal(next.banks["coding-agent::project"].retainSessions, false);
  const inherited = updateConfig(next, { repositoryPolicy: "inherit" }, await resolveRepo(next));
  assert.equal(inherited.banks["coding-agent::project"].disabled, undefined);
  assert.equal(inherited.banks["coding-agent::project"].bank, "shared");
  assert.equal(raw.harnesses.dsh.disabled, undefined);
});
test("拒绝无效结构与危险 bank 名称", async () => {
  assert.throws(() => mergedConfig({ harnesses: [] }), /invalidConfig/);
  assert.throws(() => mergedConfig({ disabled: "false" }), /invalidConfig/);
  await assert.rejects(resolveRepo({ bankId: "__proto__" }), /invalidBank/);
});
test("识别普通仓库、linked worktree、裸仓库与普通目录，不运行 shell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dhs-model-"));
  try {
    const main = join(dir, "main"); const worktree = join(dir, "linked");
    await mkdir(join(main, ".git", "worktrees", "linked"), { recursive: true });
    await mkdir(join(worktree, "sub"), { recursive: true });
    await writeFile(join(worktree, ".git"), `gitdir: ${join(main, ".git", "worktrees", "linked")}\n`);
    await writeFile(join(main, ".git", "worktrees", "linked", "commondir"), "../..\n");
    assert.equal(await repositoryRoot(worktree), await realpath(main));
    assert.equal(await repositoryRoot(join(worktree, "sub")), await realpath(main));
    assert.equal(await repositoryRoot(main), await realpath(main));
    assert.equal(await repositoryRoot(dir), null);
    const bare = join(dir, "bare.git"); await mkdir(join(bare, "objects"), { recursive: true }); await writeFile(join(bare, "HEAD"), "ref: refs/heads/main\n");
    assert.equal(await repositoryRoot(bare), await realpath(bare));
  } finally {
    assert.equal(dir.startsWith(join(tmpdir(), "dhs-model-")), true);
    await rm(dir, { recursive: true });
  }
});
