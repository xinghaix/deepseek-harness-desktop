import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ASSETS_DIR = resolve(__dirname, "..", "assets");

export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BUCKET_ORDER = ["engineering", "productivity", "in-progress", "misc"];

export const BUCKET_CONFIG_KEYS = {
  engineering: "enableEngineering",
  productivity: "enableProductivity",
  "in-progress": "enableInProgress",
  misc: "enableMisc",
};

export const DEFAULT_CONFIG = Object.freeze({
  enableEngineering: true,
  enableProductivity: true,
  enableInProgress: false,
  enableMisc: false,
  linkToDshSkills: true,
  disabledSkills: [],
});

/**
 * Unwrap a Volatile<T> field (created by Schemastery `.volatile()`) or return a plain value.
 */
export function unwrapVolatile(field, fallback) {
  if (field !== null && typeof field === "object" && typeof field.get === "function") {
    const val = field.get();
    return val === undefined ? fallback : val;
  }
  return field === undefined ? fallback : field;
}

/**
 * Normalize raw plugin config (supporting both Schemastery Volatile fields and plain objects).
 */
export function resolveConfigValue(rawConfig = {}) {
  const rawDisabled = unwrapVolatile(rawConfig?.disabledSkills, DEFAULT_CONFIG.disabledSkills);
  const disabledSkills = Array.isArray(rawDisabled)
    ? rawDisabled.map((item) => String(unwrapVolatile(item, "")).trim()).filter(Boolean)
    : [];
  return {
    enableEngineering: Boolean(
      unwrapVolatile(rawConfig?.enableEngineering, DEFAULT_CONFIG.enableEngineering)
    ),
    enableProductivity: Boolean(
      unwrapVolatile(rawConfig?.enableProductivity, DEFAULT_CONFIG.enableProductivity)
    ),
    enableInProgress: Boolean(
      unwrapVolatile(rawConfig?.enableInProgress, DEFAULT_CONFIG.enableInProgress)
    ),
    enableMisc: Boolean(unwrapVolatile(rawConfig?.enableMisc, DEFAULT_CONFIG.enableMisc)),
    linkToDshSkills: Boolean(
      unwrapVolatile(rawConfig?.linkToDshSkills, DEFAULT_CONFIG.linkToDshSkills)
    ),
    disabledSkills,
  };
}

function unquoteYamlScalar(rawVal) {
  const trimmed = rawVal.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n");
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/**
 * Parse YAML frontmatter block (`--- ... ---`) from a SKILL.md string.
 */
export function parseFrontmatter(raw) {
  if (typeof raw !== "string") return undefined;
  const firstLineEnd = raw.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, "") !== "---") return undefined;

  const start = firstLineEnd + 1;
  let lineStart = start;
  let closing = undefined;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, "") === "---") {
      closing = {
        start: lineStart,
        bodyStart: nextNewline < 0 ? raw.length : nextNewline + 1,
      };
      break;
    }
    if (nextNewline < 0) break;
    lineStart = nextNewline + 1;
  }
  if (!closing) return undefined;

  const yamlLines = raw.slice(start, closing.start).split(/\r?\n/);
  const data = {};
  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx <= 0) {
      throw new Error(`invalid YAML frontmatter line: ${line}`);
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const valStr = trimmed.slice(colonIdx + 1);
    data[key] = unquoteYamlScalar(valStr);
  }

  return {
    data,
    body: raw.slice(closing.bodyStart),
  };
}

function rejectLegacyInvocationKey(data, legacy, canonical) {
  if (Object.prototype.hasOwnProperty.call(data, legacy)) {
    throw new Error(`frontmatter field "${legacy}" is unsupported; use "${canonical}"`);
  }
}

function frontmatterBoolean(data, key) {
  if (!Object.prototype.hasOwnProperty.call(data, key)) return undefined;
  const value = data[key];
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (typeof value === "string") {
    switch (value.toLowerCase()) {
      case "true":
      case "yes":
      case "on":
        return true;
      case "false":
      case "no":
      case "off":
        return false;
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}

export function parseInvocationPolicy(data) {
  rejectLegacyInvocationKey(data, "disableModelInvocation", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "modelInvocable", "disable-model-invocation");
  rejectLegacyInvocationKey(data, "userInvocable", "user-invocable");
  const disableModelInvocation = frontmatterBoolean(data, "disable-model-invocation");
  const userInvocable = frontmatterBoolean(data, "user-invocable");
  return {
    modelInvocable: disableModelInvocation !== true,
    userInvocable: userInvocable !== false,
  };
}

/**
 * Parse and validate a single SKILL.md content string.
 */
export function parseSkillMarkdown(raw, filePath = "<memory>") {
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    throw new Error(`skill file ${filePath}: missing YAML frontmatter`);
  }
  const name = typeof parsed.data.name === "string" ? parsed.data.name.trim() : "";
  const description =
    typeof parsed.data.description === "string" ? parsed.data.description.trim() : "";
  if (!name || !description) {
    throw new Error(`skill file ${filePath}: frontmatter requires name and description`);
  }
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(`skill file ${filePath}: invalid skill name "${name}"`);
  }
  const invocation = parseInvocationPolicy(parsed.data);
  const argumentHint =
    typeof parsed.data["argument-hint"] === "string" && parsed.data["argument-hint"].length > 0
      ? parsed.data["argument-hint"]
      : undefined;

  return {
    name,
    description,
    invocation,
    ...(argumentHint ? { argumentHint } : {}),
    content: parsed.body.trim(),
  };
}

function listSupportingFiles(skillDir) {
  const results = [];
  function walk(currentDir) {
    const entries = readdirSync(currentDir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && !(currentDir === skillDir && entry.name === "SKILL.md")) {
        results.push(relative(skillDir, fullPath).replace(/\\/g, "/"));
      }
    }
  }
  walk(skillDir);
  return results;
}

/**
 * Scan all 4 buckets under `assetsRoot` and return the complete 38-skill catalog.
 */
export function loadSkillCatalog(assetsRoot = DEFAULT_ASSETS_DIR) {
  const catalog = [];
  const resolvedRoot = resolve(assetsRoot);

  for (const bucket of BUCKET_ORDER) {
    const bucketDir = join(resolvedRoot, bucket);
    let entries;
    try {
      entries = readdirSync(bucketDir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = join(bucketDir, entry.name);
      const skillFile = join(skillDir, "SKILL.md");
      try {
        if (!statSync(skillFile).isFile()) continue;
      } catch {
        continue;
      }
      const raw = readFileSync(skillFile, "utf8");
      const parsed = parseSkillMarkdown(raw, skillFile);
      catalog.push({
        name: parsed.name,
        description: parsed.description,
        invocation: parsed.invocation,
        ...(parsed.argumentHint ? { argumentHint: parsed.argumentHint } : {}),
        content: parsed.content,
        bucket,
        baseDir: skillDir,
        path: skillFile,
        supportingFiles: listSupportingFiles(skillDir),
      });
    }
  }

  return catalog;
}

/**
 * Filter the catalog according to bucket toggles and `disabledSkills`.
 */
export function filterEnabledSkills(catalog, rawConfig = DEFAULT_CONFIG) {
  const cfg = resolveConfigValue(rawConfig);
  const disabledSet = new Set(cfg.disabledSkills);

  return catalog.filter((skill) => {
    const bucketKey = BUCKET_CONFIG_KEYS[skill.bucket];
    if (!bucketKey || !cfg[bucketKey]) return false;
    if (disabledSet.has(skill.name)) return false;
    return true;
  });
}
