import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_ASSETS_DIR,
  DEFAULT_CONFIG,
  filterEnabledSkills,
  loadSkillCatalog,
  parseSkillMarkdown,
} from "../lib/catalog.js";

test("Contract 1: Full 38-skill discovery, bucket counts, and invocation policies", () => {
  const catalog = loadSkillCatalog(DEFAULT_ASSETS_DIR);
  assert.equal(catalog.length, 38, "Expected 38 total skills across 4 buckets");

  const byBucket = {
    engineering: catalog.filter((s) => s.bucket === "engineering"),
    productivity: catalog.filter((s) => s.bucket === "productivity"),
    "in-progress": catalog.filter((s) => s.bucket === "in-progress"),
    misc: catalog.filter((s) => s.bucket === "misc"),
  };

  assert.equal(byBucket.engineering.length, 20);
  assert.equal(byBucket.productivity.length, 7);
  assert.equal(byBucket["in-progress"].length, 7);
  assert.equal(byBucket.misc.length, 4);

  const userOnly = catalog.filter(
    (s) => s.invocation.modelInvocable === false && s.invocation.userInvocable === true
  );
  const modelInvocable = catalog.filter(
    (s) => s.invocation.modelInvocable === true && s.invocation.userInvocable === true
  );

  assert.equal(userOnly.length, 23, "Expected 23 user-invoked skills (disable-model-invocation: true)");
  assert.equal(modelInvocable.length, 15, "Expected 15 model-invocable skills");
});

test("Contract 1b (M2): Frontmatter parser rejects legacy camelCase keys and tolerates argument-hint", () => {
  assert.throws(
    () =>
      parseSkillMarkdown(
        `---\nname: legacy-skill\ndescription: Legacy\ndisableModelInvocation: true\n---\nBody`
      ),
    /frontmatter field "disableModelInvocation" is unsupported; use "disable-model-invocation"/
  );

  assert.throws(
    () =>
      parseSkillMarkdown(
        `---\nname: legacy-skill\ndescription: Legacy\nuserInvocable: false\n---\nBody`
      ),
    /frontmatter field "userInvocable" is unsupported; use "user-invocable"/
  );

  const withHint = parseSkillMarkdown(
    `---\nname: handoff\ndescription: Handoff session\ndisable-model-invocation: true\nargument-hint: "Focus area"\n---\nBody content`
  );
  assert.equal(withHint.name, "handoff");
  assert.equal(withHint.argumentHint, "Focus area");
  assert.deepEqual(withHint.invocation, { modelInvocable: false, userInvocable: true });
});

test("Contract 2: Bucket toggles and disabledSkills filtering", () => {
  const catalog = loadSkillCatalog(DEFAULT_ASSETS_DIR);

  const defaultEnabled = filterEnabledSkills(catalog, DEFAULT_CONFIG);
  assert.equal(defaultEnabled.length, 27);

  const withInProgress = filterEnabledSkills(catalog, {
    ...DEFAULT_CONFIG,
    enableInProgress: true,
  });
  assert.equal(withInProgress.length, 34);

  const withAll = filterEnabledSkills(catalog, {
    ...DEFAULT_CONFIG,
    enableInProgress: true,
    enableMisc: true,
  });
  assert.equal(withAll.length, 38);

  const withDisabledSkills = filterEnabledSkills(catalog, {
    ...DEFAULT_CONFIG,
    disabledSkills: ["tdd", "grilling"],
  });
  assert.equal(withDisabledSkills.length, 25);
  assert.equal(withDisabledSkills.some((s) => s.name === "tdd"), false);
  assert.equal(withDisabledSkills.some((s) => s.name === "grilling"), false);
});

test("Contract 5 & 6: Relative markdown links in SKILL.md resolve on disk and zero em-dashes exist", () => {
  const catalog = loadSkillCatalog(DEFAULT_ASSETS_DIR);
  const mdLinkRe = /\[[^\]]+\]\((?!https?:\/\/|#)([^)]+)\)/g;

  for (const skill of catalog) {
    assert.equal(
      skill.content.includes("\u2014"),
      false,
      `Unexpected em-dash in ${skill.bucket}/${skill.name}/SKILL.md`
    );

    // Strip fenced and inline code blocks before checking relative links so illustrative examples inside backticks are not mistaken for bundled asset links
    const proseOnly = skill.content.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
    for (const match of proseOnly.matchAll(mdLinkRe)) {
      const relTarget = match[1].split("#")[0].trim();
      if (!relTarget || relTarget.startsWith("<")) continue;
      const targetPath = join(skill.baseDir, relTarget);
      assert.equal(
        existsSync(targetPath),
        true,
        `Broken relative link "${relTarget}" in ${skill.bucket}/${skill.name}/SKILL.md (expected ${targetPath})`
      );
    }

    for (const sup of skill.supportingFiles) {
      const supPath = join(skill.baseDir, sup);
      assert.equal(existsSync(supPath), true);
      if (sup.endsWith(".md")) {
        const supText = readFileSync(supPath, "utf8");
        assert.equal(
          supText.includes("\u2014"),
          false,
          `Unexpected em-dash in ${skill.bucket}/${skill.name}/${sup}`
        );
      }
    }
  }
});
