import { lstat, mkdir, readdir, readlink, realpath, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_ASSETS_DIR } from "./catalog.js";

/**
 * Resolve `$DSH_HOME/skills` or fallback to `~/.dsh/skills`.
 */
export function resolveDshSkillsDir(explicitDshSkillsDir) {
  if (typeof explicitDshSkillsDir === "string" && explicitDshSkillsDir.trim().length > 0) {
    return resolve(explicitDshSkillsDir);
  }
  const dshHome = process.env.DSH_HOME?.trim();
  if (dshHome) {
    return join(resolve(dshHome), "skills");
  }
  return join(homedir(), ".dsh", "skills");
}

function isSubpathOf(candidatePath, parentPath) {
  const rel = relative(parentPath, candidatePath);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Determine whether `entryPath` is a symlink managed by `dsh-mattpocock-skills`
 * (pointing inside `assets/`). Uses `lstat` + `readlink` rather than `realpath(entryPath)`
 * so dangling symlinks left by removed/renamed skills are still recognized and cleaned up.
 */
export async function isManagedSymlink(entryPath, rawAssetsDir, realAssetsDir) {
  let st;
  try {
    st = await lstat(entryPath);
  } catch {
    return false;
  }
  if (!st.isSymbolicLink()) return false;

  let rawTarget;
  try {
    rawTarget = await readlink(entryPath);
  } catch {
    return false;
  }

  const resolvedTarget = resolve(dirname(entryPath), rawTarget);
  if (isSubpathOf(resolvedTarget, rawAssetsDir) || isSubpathOf(resolvedTarget, realAssetsDir)) {
    return true;
  }

  try {
    const realTarget = await realpath(resolvedTarget);
    return isSubpathOf(realTarget, rawAssetsDir) || isSubpathOf(realTarget, realAssetsDir);
  } catch {
    return false;
  }
}

/**
 * Synchronize enabled skill symlinks under `~/.dsh/skills` (or `$DSH_HOME/skills`).
 * Never overwrites or deletes user-owned directories or symlinks pointing outside `assets/`.
 */
export async function syncDshSkillLinks({
  enabledSkills = [],
  linkToDshSkills = true,
  assetsDir = DEFAULT_ASSETS_DIR,
  dshSkillsDir,
  logger,
} = {}) {
  const targetSkillsDir = resolveDshSkillsDir(dshSkillsDir);
  const rawAssetsDir = resolve(assetsDir);
  const realAssetsDir = await realpath(rawAssetsDir).catch(() => rawAssetsDir);

  const desiredByName = new Map();
  if (linkToDshSkills) {
    for (const skill of enabledSkills) {
      desiredByName.set(skill.name, resolve(skill.baseDir));
    }
  }

  const linkedNames = new Set();
  const skippedUserOwned = [];
  const removedNames = [];

  await mkdir(targetSkillsDir, { recursive: true });

  let existingEntries = [];
  try {
    existingEntries = await readdir(targetSkillsDir);
  } catch {
    existingEntries = [];
  }

  // 1. Inspect existing entries: remove stale/disabled managed symlinks; preserve user-owned entries
  for (const entryName of existingEntries) {
    const entryPath = join(targetSkillsDir, entryName);
    const managed = await isManagedSymlink(entryPath, rawAssetsDir, realAssetsDir);
    if (!managed) {
      continue;
    }

    const desiredTarget = desiredByName.get(entryName);
    if (!desiredTarget) {
      try {
        await unlink(entryPath);
        removedNames.push(entryName);
      } catch (err) {
        logger?.warn?.(`[dsh-mattpocock-skills] Failed to unlink ${entryPath}: ${String(err)}`);
      }
      continue;
    }

    // Managed symlink exists and is still desired; verify its target matches desiredTarget
    const currentRaw = await readlink(entryPath).catch(() => "");
    const currentResolved = currentRaw ? resolve(dirname(entryPath), currentRaw) : "";
    const desiredReal = await realpath(desiredTarget).catch(() => desiredTarget);
    const currentReal = currentResolved
      ? await realpath(currentResolved).catch(() => currentResolved)
      : "";

    if (currentResolved === desiredTarget || currentReal === desiredReal) {
      linkedNames.add(entryName);
    } else {
      try {
        await unlink(entryPath);
        await symlink(
           desiredTarget,
          entryPath,
          process.platform === "win32" ? "junction" : "dir"
        );
        linkedNames.add(entryName);
      } catch (err) {
        logger?.warn?.(`[dsh-mattpocock-skills] Failed to update symlink ${entryPath}: ${String(err)}`);
      }
    }
  }

  // 2. Create missing desired symlinks (skipping any colliding user-owned directory/file/symlink)
  for (const [skillName, desiredTarget] of desiredByName.entries()) {
    if (linkedNames.has(skillName)) continue;
    const entryPath = join(targetSkillsDir, skillName);

    let exists = false;
    try {
      await lstat(entryPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      skippedUserOwned.push(skillName);
      logger?.info?.(
        `[dsh-mattpocock-skills] Skipping ~/.dsh/skills/${skillName}: user-owned skill already exists`
      );
      continue;
    }

    try {
      await symlink(
        desiredTarget,
        entryPath,
        process.platform === "win32" ? "junction" : "dir"
      );
      linkedNames.add(skillName);
    } catch (err) {
      logger?.warn?.(`[dsh-mattpocock-skills] Failed to create symlink ${entryPath}: ${String(err)}`);
    }
  }

  return {
    dshSkillsDir: targetSkillsDir,
    linkedNames,
    skippedUserOwned,
    removedNames,
  };
}

/**
 * Remove all symlinks in `dshSkillsDir` managed by this plugin.
 */
export async function removeManagedSymlinks({
  assetsDir = DEFAULT_ASSETS_DIR,
  dshSkillsDir,
  logger,
} = {}) {
  return syncDshSkillLinks({
    enabledSkills: [],
    linkToDshSkills: false,
    assetsDir,
    dshSkillsDir,
    logger,
  });
}
