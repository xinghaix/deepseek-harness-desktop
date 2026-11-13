import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { lstat, readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { SettingsError, object, section, mergedConfig, dshEnabled, resolveRepository, updateConfig } from "./model.js";

const MAX_BYTES = 1024 * 1024;
const revisionOf = text => createHash("sha256").update(text === null ? "missing" : "file:" + text).digest("hex");
export class SettingsStore {
  constructor({ path = process.env.HINDSIGHT_CONFIG || join(homedir(), ".hindsight", "coding-agent.json"), env = process.env, listWorkspaces = () => [], rootOf, home = homedir() } = {}) {
    this.path = resolve(path);
    this.env = env;
    this.home = home;
    this.rootOf = rootOf;
    this.listWorkspaces = listWorkspaces;
    this.queue = Promise.resolve();
    this.changedThisRun = false;
    this.closed = false;
  }
  async read() {
    let text = null;
    try {
      const info = await lstat(this.path);
      if (info.isSymbolicLink() || !info.isFile()) throw new SettingsError("unsafeConfig");
      if (info.size > MAX_BYTES) throw new SettingsError("configTooLarge");
      text = await readFile(this.path, "utf8");
      if (Buffer.byteLength(text) > MAX_BYTES) throw new SettingsError("configTooLarge");
    } catch (error) {
      if (error.code !== "ENOENT") throw error instanceof SettingsError ? error : new SettingsError("readFailed");
    }
    let raw = {};
    if (text !== null) {
      try { raw = JSON.parse(text); } catch { throw new SettingsError("invalidConfig"); }
      if (!object(raw)) throw new SettingsError("invalidConfig");
    }
    // 校验被编辑的层，不能因错误结构悄悄丢弃现有值。
    mergedConfig(raw, this.env);
    return { raw, text, revision: revisionOf(text) };
  }
  workspaces() {
    return this.listWorkspaces().map(item => ({ id: item.id, title: item.title, path: item.path }));
  }
  async repository(raw, workspaceId) {
    if (!workspaceId) return null;
    const workspace = this.workspaces().find(item => item.id === workspaceId);
    if (!workspace) throw new SettingsError("workspaceMissing");
    return { workspaceId, ...await resolveRepository(raw, workspace.path, { env: this.env, home: this.home, rootOf: this.rootOf }) };
  }
  async status(workspaceId) {
    const snapshot = await this.read();
    let repository = null;
    let repositoryError = null;
    try { repository = await this.repository(snapshot.raw, workspaceId); }
    catch (error) { repositoryError = error instanceof SettingsError ? error.code : "repositoryUnavailable"; }
    const cfg = mergedConfig(snapshot.raw, this.env);
    return {
      configPath: this.path, exists: snapshot.text !== null, revision: snapshot.revision,
      dshEnabled: dshEnabled(snapshot.raw, this.env),
      dshOverride: section(section(snapshot.raw.harnesses).dsh).disabled != null,
      optInOnly: cfg.optInOnly === true,
      workspaces: this.workspaces(), repository, repositoryError,
      changedThisRun: this.changedThisRun,
      runtimeState: "unknown", applies: "restart-required",
    };
  }
  async save(input) {
    if (!object(input) || Object.keys(input).some(key => !["revision", "workspaceId", "bankId", "dshEnabled", "repositoryPolicy", "confirmShared"].includes(key)) || typeof input.revision !== "string" || !/^[a-f0-9]{64}$/.test(input.revision)) throw new SettingsError("badRequest");
    if (input.dshEnabled !== undefined && typeof input.dshEnabled !== "boolean") throw new SettingsError("badRequest");
    if (input.repositoryPolicy === undefined && input.dshEnabled === undefined) throw new SettingsError("badRequest");
    if (input.workspaceId !== undefined && (typeof input.workspaceId !== "string" || input.workspaceId.length > 1024)) throw new SettingsError("badRequest");
    const operation = this.queue.then(() => this.commit(input));
    this.queue = operation.catch(() => {});
    return operation;
  }
  async commit(input) {
    if (this.closed) throw new SettingsError("closing");
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lockPath = this.path + ".dsh-hindsight-settings.lock";
    let lock;
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) { throw new SettingsError(error.code === "EEXIST" ? "configBusy" : "writeFailed"); }
    const temporary = join(dirname(this.path), `.dsh-hindsight-settings-${randomUUID()}.tmp`);
    let createdTemporary = false;
    let changed = false;
    try {
      const before = await this.read();
      if (before.revision !== input.revision) throw new SettingsError("conflict");
      let repository = null;
      if (input.repositoryPolicy !== undefined) {
        if (!input.workspaceId || input.confirmShared !== true) throw new SettingsError("confirmShared");
        repository = await this.repository(before.raw, input.workspaceId);
        if (repository.bankId !== input.bankId) throw new SettingsError("conflict");
      }
      const next = updateConfig(before.raw, input, repository);
      changed = JSON.stringify(next) !== JSON.stringify(before.raw);
      if (changed) {
        const text = JSON.stringify(next, null, 2) + "\n";
        if (Buffer.byteLength(text) > MAX_BYTES) throw new SettingsError("configTooLarge");
        const file = await open(temporary, "wx", 0o600);
        createdTemporary = true;
        try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
        // 锁协调本插件的多进程写入；再次比对可发现编辑器在保存期间的大部分外部修改。
        if ((await this.read()).revision !== before.revision) throw new SettingsError("conflict");
        await rename(temporary, this.path);
        createdTemporary = false;
        this.changedThisRun = true;
      }
    } catch (error) {
      throw error instanceof SettingsError ? error : new SettingsError("writeFailed");
    } finally {
      if (createdTemporary) await unlink(temporary).catch(() => {});
      await lock.close();
      await unlink(lockPath);
    }
    // 写入已提交后，读取失败不能把一次成功保存误报为未写入。
    try { return { saved: changed, status: await this.status(input.workspaceId) }; }
    catch { return { saved: changed, status: null, warning: "savedRefreshFailed" }; }
  }
  async close() { this.closed = true; await this.queue; }
}
