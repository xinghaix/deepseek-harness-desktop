import { createRequire } from "node:module";
import {
  DEFAULT_ASSETS_DIR,
  DEFAULT_CONFIG,
  filterEnabledSkills,
  loadSkillCatalog,
  resolveConfigValue,
} from "./catalog.js";
import { removeManagedSymlinks, syncDshSkillLinks } from "./linker.js";

function loadSchemastery() {
  const candidates = [
    import.meta.url,
    process.argv[1] ? `file://${process.argv[1]}` : null,
    "file:///opt/homebrew/lib/node_modules/@deepseek-ai/dsh/package.json",
    "file:///usr/local/lib/node_modules/@deepseek-ai/dsh/package.json",
  ].filter(Boolean);

  for (const base of candidates) {
    try {
      const req = createRequire(base);
      const mod = req("@deepseek-ai/schemastery");
      return mod?.default ?? mod;
    } catch {
      // try next candidate
    }
  }

  // Fallback chainable schema stub for isolated test environments without DSH installed
  const makeChain = () => {
    const fn = (v) => v;
    fn.default = () => fn;
    fn.description = () => fn;
    fn.volatile = () => fn;
    return fn;
  };
  return {
    object: (shape) => {
      const fn = (v) => v;
      fn.dict = shape;
      return fn;
    },
    boolean: () => makeChain(),
    string: () => makeChain(),
    array: () => makeChain(),
  };
}

const z = loadSchemastery();

export const name = "dsh-mattpocock-skills";
export const inject = ["skills"];

export const BUNDLED_PROVIDER_NAME = "mattpocock:bundled";
export const BUNDLED_SKILL_RANK = 600;

export const Config = z.object({
  enableEngineering: z
    .boolean()
    .default(DEFAULT_CONFIG.enableEngineering)
    .description("启用核心工程技能包（20 个：需求采访、领域建模、架构深模块、接缝 TDD、双轴代码审查、分诊等）")
    .volatile(),
  enableProductivity: z
    .boolean()
    .default(DEFAULT_CONFIG.enableProductivity)
    .description("启用通用生产力技能包（7 个：grill-me、grilling、handoff、teach、to-questionnaire、wait-what、writing-for-agents）")
    .volatile(),
  enableInProgress: z
    .boolean()
    .default(DEFAULT_CONFIG.enableInProgress)
    .description("启用演进中实验技能包（7 个：chief-of-staff、claude-handoff、loop-me、setup-ts-deep-modules、三阶段写作）")
    .volatile(),
  enableMisc: z
    .boolean()
    .default(DEFAULT_CONFIG.enableMisc)
    .description("启用扩展工具栈技能包（4 个：git-guardrails、migrate-to-shoehorn、scaffold-exercises、setup-pre-commit）")
    .volatile(),
  linkToDshSkills: z
    .boolean()
    .default(DEFAULT_CONFIG.linkToDshSkills)
    .description("自动将已启用技能软链接至 ~/.dsh/skills（保留用户自有技能不覆盖，关闭时自动清理本插件软链接）")
    .volatile(),
  disabledSkills: z
    .array(z.string())
    .default(DEFAULT_CONFIG.disabledSkills)
    .description("单独禁用的技能名称列表（例如：['retro', 'wizard']）")
    .volatile(),
});

function isFilesystemProviderRegistered(skillsService) {
  try {
    const globalProviders = skillsService?.layers?.global?.providers;
    if (globalProviders && typeof globalProviders.get === "function") {
      return globalProviders.get("filesystem") !== undefined;
    }
  } catch {
    // Fallback if internal structure differs
  }
  return false;
}

export function apply(ctx, config = {}, options = {}) {
  const assetsDir = options.assetsDir ?? DEFAULT_ASSETS_DIR;
  const dshSkillsDir = options.dshSkillsDir;
  let cachedCatalog;
  const getCatalog = () => (cachedCatalog ??= loadSkillCatalog(assetsDir));

  let currentLinkedNames = new Set();
  let syncPromise = Promise.resolve();
  let providerControl = undefined;

  const runSync = () => {
    syncPromise = syncPromise
      .catch(() => {})
      .then(async () => {
        const catalog = getCatalog();
        const resolved = resolveConfigValue(config);
        const enabledSkills = filterEnabledSkills(catalog, resolved);
        const res = await syncDshSkillLinks({
          enabledSkills,
          linkToDshSkills: resolved.linkToDshSkills,
          assetsDir,
          dshSkillsDir,
          logger: ctx.logger,
        });
        currentLinkedNames = res.linkedNames;
        providerControl?.invalidate?.();
        return res;
      });
    return syncPromise;
  };

  // Trigger initial symlink synchronization asynchronously off the synchronous apply() path
  runSync();

  const skillsService = ctx.skills ?? ctx.skillRegistry;
  if (skillsService && typeof skillsService.registerProvider === "function") {
    skillsService.registerProvider((control) => {
      providerControl = control;
      return {
        name: BUNDLED_PROVIDER_NAME,
        async list(_lookupOptions = {}) {
          await syncPromise;
          const catalog = getCatalog();
          const resolved = resolveConfigValue(config);
          const enabledSkills = filterEnabledSkills(catalog, resolved);
          const fsActive =
            resolved.linkToDshSkills && isFilesystemProviderRegistered(skillsService);

          const candidates = [];
          for (const skill of enabledSkills) {
            // Avoid duplicate skill warning when ~/.dsh/skills symlink is active and served by filesystem provider
            if (fsActive && currentLinkedNames.has(skill.name)) {
              continue;
            }
            candidates.push({
              name: skill.name,
              description: skill.description,
              invocation: skill.invocation,
              source: "bundled",
              rank: BUNDLED_SKILL_RANK,
              provider: BUNDLED_PROVIDER_NAME,
              path: skill.path,
              resourceBase: {
                kind: "directory",
                path: skill.baseDir,
              },
              locator: skill,
            });
          }
          return candidates;
        },
        async get(candidate) {
          const catalog = getCatalog();
          const skill =
            candidate?.locator ??
            catalog.find((entry) => entry.name === (candidate?.name ?? candidate));
          if (!skill) return undefined;
          const resolved = resolveConfigValue(config);
          const enabledSkills = filterEnabledSkills(catalog, resolved);
          if (!enabledSkills.some((entry) => entry.name === skill.name)) {
            return undefined;
          }
          return {
            name: skill.name,
            description: skill.description,
            invocation: skill.invocation,
            source: "bundled",
            provider: BUNDLED_PROVIDER_NAME,
            resourceBase: {
              kind: "directory",
              path: skill.baseDir,
            },
            path: skill.path,
            content: skill.content,
          };
        },
      };
    });
  }

  // Re-sync ~/.dsh/skills symlinks whenever volatile config updates in the GUI
  if (typeof ctx.on === "function") {
    ctx.on("loader/volatile-update", () => {
      runSync();
    });
  }

  if (typeof ctx.effect === "function") {
    ctx.effect(() => {
      return () => {
        // Only remove ~/.dsh/skills symlinks when the plugin row is explicitly disabled at runtime,
        // not during normal process shutdown (Review Item M1).
        if (ctx.fiber?.entry?.options?.disabled === true) {
          removeManagedSymlinks({
            assetsDir,
            dshSkillsDir,
            logger: ctx.logger,
          }).catch(() => {});
        }
      };
    }, "dsh-mattpocock-skills: symlink lifecycle");
  }

  if (typeof ctx.inject === "function") {
    ctx.inject(["settings"], (child) => {
      child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    });
  }

  return {
    get catalog() {
      return getCatalog();
    },
    getSyncPromise: () => syncPromise,
    runSync,
  };
}
