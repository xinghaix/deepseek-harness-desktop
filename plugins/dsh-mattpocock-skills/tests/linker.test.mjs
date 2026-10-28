import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_ASSETS_DIR, DEFAULT_CONFIG, filterEnabledSkills, loadSkillCatalog } from "../lib/catalog.js";
import { syncDshSkillLinks } from "../lib/linker.js";

test("Contract 3 & I3: ~/.dsh/skills symlink sync, dangling symlink cleanup, and user asset protection", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mp-skills-linker-test-"));
  const dshSkillsDir = join(tempRoot, "skills");
  const externalDir = join(tempRoot, "external-skill");
  mkdirSync(dshSkillsDir, { recursive: true });
  mkdirSync(externalDir, { recursive: true });
  writeFileSync(join(externalDir, "SKILL.md"), "---\nname: custom-link\ndescription: ext\n---\n", "utf8");

  try {
    // 1. Pre-populate user-owned skills & a dangling managed symlink
    const userSkillDir = join(dshSkillsDir, "codexhost-delegation");
    mkdirSync(userSkillDir, { recursive: true });
    writeFileSync(join(userSkillDir, "SKILL.md"), "user skill", "utf8");

    // User-owned colliding directory named "tdd"
    const userTddDir = join(dshSkillsDir, "tdd");
    mkdirSync(userTddDir, { recursive: true });
    writeFileSync(join(userTddDir, "SKILL.md"), "my custom tdd", "utf8");

    // External symlink pointing outside assets/
    const customLinkPath = join(dshSkillsDir, "custom-link");
    symlinkSync(externalDir, customLinkPath, "dir");

    // Dangling managed symlink pointing inside assets/engineering/non-existent-old-skill (Review Item I3)
    const danglingManagedPath = join(dshSkillsDir, "non-existent-old-skill");
    symlinkSync(join(DEFAULT_ASSETS_DIR, "engineering", "non-existent-old-skill"), danglingManagedPath, "dir");

    const catalog = loadSkillCatalog(DEFAULT_ASSETS_DIR);
    const defaultEnabled = filterEnabledSkills(catalog, DEFAULT_CONFIG);

    // 2. Run sync with linkToDshSkills: true
    const res1 = await syncDshSkillLinks({
      enabledSkills: defaultEnabled,
      linkToDshSkills: true,
      assetsDir: DEFAULT_ASSETS_DIR,
      dshSkillsDir,
    });

    // Dangling managed symlink must be cleaned up
    assert.equal(existsSync(danglingManagedPath), false);
    assert.throws(() => lstatSync(danglingManagedPath), /ENOENT/);
    assert.equal(res1.removedNames.includes("non-existent-old-skill"), true);

    // User's colliding "tdd" directory must be skipped and preserved untouched
    assert.equal(res1.skippedUserOwned.includes("tdd"), true);
    assert.equal(res1.linkedNames.has("tdd"), false);
    assert.equal(lstatSync(userTddDir).isSymbolicLink(), false);
    assert.equal(readFileSync(join(userTddDir, "SKILL.md"), "utf8"), "my custom tdd");

    // Remaining 26 core skills must be linked and readable (including supporting files)
    assert.equal(res1.linkedNames.size, 26);
    assert.equal(lstatSync(join(dshSkillsDir, "grill-with-docs")).isSymbolicLink(), true);
    assert.equal(
      existsSync(join(dshSkillsDir, "improve-codebase-architecture", "HTML-REPORT.md")),
      true
    );
    assert.equal(existsSync(join(dshSkillsDir, "wizard", "template.sh")), true);

    // User's codexhost-delegation and custom-link must remain intact
    assert.equal(readFileSync(join(userSkillDir, "SKILL.md"), "utf8"), "user skill");
    assert.equal(lstatSync(customLinkPath).isSymbolicLink(), true);

    // 3. Disable engineering bucket -> 19 managed engineering links removed, 7 productivity links kept
    const prodOnly = filterEnabledSkills(catalog, {
      ...DEFAULT_CONFIG,
      enableEngineering: false,
      enableProductivity: true,
    });
    const res2 = await syncDshSkillLinks({
      enabledSkills: prodOnly,
      linkToDshSkills: true,
      assetsDir: DEFAULT_ASSETS_DIR,
      dshSkillsDir,
    });
    assert.equal(res2.linkedNames.size, 7);
    assert.equal(res2.removedNames.length, 19);
    assert.equal(existsSync(join(dshSkillsDir, "grill-with-docs")), false);
    assert.equal(existsSync(join(dshSkillsDir, "grilling", "SKILL.md")), true);

    // 4. Turn linkToDshSkills: false -> all 7 remaining managed links removed, user assets untouched
    const res3 = await syncDshSkillLinks({
      enabledSkills: prodOnly,
      linkToDshSkills: false,
      assetsDir: DEFAULT_ASSETS_DIR,
      dshSkillsDir,
    });
    assert.equal(res3.linkedNames.size, 0);
    assert.equal(res3.removedNames.length, 7);
    assert.equal(existsSync(join(dshSkillsDir, "grilling")), false);
    assert.equal(readFileSync(join(userSkillDir, "SKILL.md"), "utf8"), "user skill");
    assert.equal(readFileSync(join(userTddDir, "SKILL.md"), "utf8"), "my custom tdd");
    assert.equal(lstatSync(customLinkPath).isSymbolicLink(), true);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
