import { basename, dirname, join, normalize, sep } from "node:path";
import { homedir } from "node:os";
import { lstat, readFile, realpath, stat } from "node:fs/promises";

export class SettingsError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function section(value) {
  if (value == null) return {};
  if (!object(value)) throw new SettingsError("invalidConfig");
  return value;
}
function bool(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "boolean") throw new SettingsError("invalidConfig");
  return value;
}
const envFields = {
  disabled: "HINDSIGHT_DISABLED", dynamicBankId: "HINDSIGHT_DYNAMIC_BANK_ID",
  resolveWorktrees: "HINDSIGHT_RESOLVE_WORKTREES", optInOnly: "HINDSIGHT_OPT_IN_ONLY",
};
export function mergedConfig(raw, env = process.env) {
  const base = {};
  for (const [key, name] of Object.entries(envFields)) {
    if (env[name]?.trim()) base[key] = ["1", "true", "yes", "on"].includes(env[name].trim().toLowerCase());
  }
  for (const [key, name] of Object.entries({ bankId: "HINDSIGHT_BANK_ID", bankIdTemplate: "HINDSIGHT_BANK_ID_TEMPLATE" })) {
    if (env[name]?.trim()) base[key] = env[name];
  }
  if (env.HINDSIGHT_OPT_IN_PATHS?.trim()) base.optInPaths = env.HINDSIGHT_OPT_IN_PATHS.split(",").map(x => x.trim()).filter(Boolean);
  const dsh = section(section(raw.harnesses).dsh);
  const result = { ...base, ...raw, ...dsh };
  result.banks = { ...section(raw.banks), ...section(dsh.banks) };
  result.paths = { ...section(raw.paths), ...section(dsh.paths) };
  for (const key of Object.keys(envFields)) if (result[key] != null) bool(result[key]);
  return result;
}
export function dshEnabled(raw, env) { return !bool(mergedConfig(raw, env).disabled, false); }
export function policyOf(value) {
  const disabled = section(value).disabled;
  return disabled == null ? "inherit" : bool(disabled) ? "disabled" : "enabled";
}
function configuredDir(value, home) {
  const expanded = value === "~" || value.startsWith("~/") ? join(home, value.slice(1)) : value;
  return normalize(expanded).replace(new RegExp(`\\${sep}+$`), "");
}
function within(path, prefix) { return path === prefix || path.startsWith(prefix + sep); }
function lookup(map, directories, home) {
  for (const directory of directories) {
    let best;
    for (const [key, value] of Object.entries(section(map))) {
      const prefix = configuredDir(key, home);
      if (within(directory, prefix) && (!best || prefix.length > best.length)) best = { value, length: prefix.length, key };
    }
    if (best) return best;
  }
}
async function optionalStat(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw new SettingsError("repositoryUnavailable"); }
}
// 不运行 git 或加载仓库配置：只读取 .git / commondir，兼容 linked worktree。
export async function repositoryRoot(directory) {
  let current;
  try { current = await realpath(directory); if (!(await stat(current)).isDirectory()) throw new Error(); }
  catch { throw new SettingsError("repositoryUnavailable"); }
  for (;;) {
    const dot = join(current, ".git");
    const entry = await optionalStat(dot);
    let gitDir;
    if (entry?.isDirectory()) gitDir = dot;
    else if (entry?.isFile()) {
      const text = await readFile(dot, "utf8");
      const match = /^gitdir:\s*(.+)\s*$/m.exec(text);
      if (!match) throw new SettingsError("repositoryUnavailable");
      gitDir = join(current, match[1].trim());
      // join 不保留绝对路径的语义，绝对指针单独处理。
      if (/^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(match[1].trim())) gitDir = match[1].trim();
    } else if (entry) throw new SettingsError("repositoryUnavailable");
    if (!gitDir && await optionalStat(join(current, "HEAD")) && (await optionalStat(join(current, "objects")))?.isDirectory()) gitDir = current;
    if (gitDir) {
      let common = gitDir;
      const commonFile = join(gitDir, "commondir");
      if (await optionalStat(commonFile)) {
        const pointer = (await readFile(commonFile, "utf8")).trim();
        common = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(pointer) ? pointer : join(gitDir, pointer);
      }
      try { common = await realpath(common); }
      catch { throw new SettingsError("repositoryUnavailable"); }
      return basename(common) === ".git" || basename(common).startsWith(".") && gitDir === current ? dirname(common) : common;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
export async function resolveRepository(raw, directory, { env = process.env, home = homedir(), rootOf = repositoryRoot } = {}) {
  const cfg = mergedConfig(raw, env);
  const root = cfg.resolveWorktrees === false ? null : await rootOf(directory);
  const directories = [...new Set([normalize(directory), root && normalize(root)].filter(Boolean))];
  const mapping = lookup(cfg.mapPathToBank, directories, home)?.value;
  let bankId;
  if (mapping) bankId = mapping;
  else if (!(cfg.dynamicBankId ?? !cfg.bankId)) bankId = cfg.bankId || "coding";
  else {
    const values = { harness: "dsh", project: basename(directory), gitProject: basename(root || directory), channel: env.HINDSIGHT_CHANNEL_ID || "default", user: env.HINDSIGHT_USER_ID || "anonymous" };
    const template = cfg.bankIdTemplate || "coding-agent::{gitProject}";
    if (typeof template !== "string") throw new SettingsError("invalidConfig");
    bankId = template.replace(/\{([a-zA-Z_]+)\}/g, (_, key) => values[key] ?? "unknown");
  }
  if (typeof bankId !== "string" || !bankId || bankId.length > 1024 || ["__proto__", "constructor", "prototype"].includes(bankId)) throw new SettingsError("invalidBank");
  const pathMatch = lookup(cfg.paths, directories, home);
  const pathConfig = section(pathMatch?.value);
  const bankConfig = section(cfg.banks[bankId]);
  const approved = !cfg.optInOnly || Boolean(mapping) || directories.some(path => (Array.isArray(cfg.optInPaths) ? cfg.optInPaths : []).some(prefix => typeof prefix === "string" && prefix && within(path, configuredDir(prefix, home))));
  const globalDisabled = bool(cfg.disabled, false);
  const effectiveDisabled = globalDisabled || !approved || bool(bankConfig.disabled, bool(pathConfig.disabled, false));
  const dshBanks = section(section(section(raw.harnesses).dsh).banks);
  const overridden = Object.hasOwn(dshBanks, bankId);
  return {
    path: directory, root, bankId, destinationBank: typeof bankConfig.bank === "string" && bankConfig.bank ? bankConfig.bank : bankId,
    policy: policyOf(section(raw.banks)[bankId]), effectivePolicy: policyOf(bankConfig),
    enabled: !effectiveDisabled, approved, overridden, pathOverride: pathMatch?.key || null,
    reason: globalDisabled ? "dshDisabled" : !approved ? "notOptedIn" : bool(bankConfig.disabled, bool(pathConfig.disabled, false)) ? "repositoryDisabled" : "allowed",
  };
}
export function updateConfig(raw, input, repository) {
  const next = structuredClone(raw);
  if (typeof input.dshEnabled === "boolean") {
    next.harnesses = { ...section(next.harnesses) };
    next.harnesses.dsh = { ...section(next.harnesses.dsh), disabled: !input.dshEnabled };
  }
  if (input.repositoryPolicy !== undefined) {
    if (!repository || repository.overridden) throw new SettingsError("repositoryOverridden");
    if (!["inherit", "enabled", "disabled"].includes(input.repositoryPolicy)) throw new SettingsError("badRequest");
    next.banks = { ...section(next.banks) };
    const bank = { ...section(next.banks[repository.bankId]) };
    if (input.repositoryPolicy === "inherit") delete bank.disabled;
    else bank.disabled = input.repositoryPolicy === "disabled";
    if (Object.keys(bank).length) next.banks[repository.bankId] = bank;
    else delete next.banks[repository.bankId];
    if (!Object.keys(next.banks).length) delete next.banks;
  }
  return next;
}
