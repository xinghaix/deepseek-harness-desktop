import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apply, BUNDLED_PROVIDER_NAME } from "../lib/index.js";

function createVolatile(initialValue) {
  let current = initialValue;
  return {
    get() {
      return current;
    },
    set(next) {
      current = next;
    },
  };
}

test("Contract 4 & 7: Provider registration, Volatile config updates, deduplication, and M1 dispose guard", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "mp-skills-provider-test-"));
  const dshSkillsDir = join(tempRoot, "skills");
  mkdirSync(dshSkillsDir, { recursive: true });

  // Pre-create a user-owned colliding "tdd" directory so "tdd" is NOT symlinked by our plugin
  const userTddDir = join(dshSkillsDir, "tdd");
  mkdirSync(userTddDir, { recursive: true });
  writeFileSync(join(userTddDir, "SKILL.md"), "user tdd", "utf8");

  try {
    let registeredProvider = null;
    let invalidateCount = 0;
    const listeners = new Map();
    const effects = [];
    const globalProviders = new Map();

    const volatileConfig = {
      enableEngineering: createVolatile(true),
      enableProductivity: createVolatile(true),
      enableInProgress: createVolatile(false),
      enableMisc: createVolatile(false),
      linkToDshSkills: createVolatile(true),
      disabledSkills: createVolatile([]),
    };

    const mockCtx = {
      fiber: {
        entry: {
          options: {
            disabled: false,
          },
        },
      },
      skills: {
        layers: {
          global: {
            providers: globalProviders,
          },
        },
        registerProvider(factory) {
          registeredProvider = factory({
            signal: new AbortController().signal,
            invalidate() {
              invalidateCount += 1;
            },
          });
          globalProviders.set(registeredProvider.name, { provider: registeredProvider });
          return () => {
            globalProviders.delete(registeredProvider.name);
          };
        },
      },
      on(eventName, handler) {
        listeners.set(eventName, handler);
        return () => listeners.delete(eventName);
      },
      effect(fn) {
        const cleanup = fn();
        effects.push(cleanup);
      },
    };

    const instance = apply(mockCtx, volatileConfig, { dshSkillsDir });
    await instance.getSyncPromise();

    assert.ok(registeredProvider, "Expected mattpocock:bundled provider to be registered");
    assert.equal(registeredProvider.name, BUNDLED_PROVIDER_NAME);
    assert.equal(invalidateCount >= 1, true);

    // 1. When "filesystem" provider is NOT registered in ctx.skills, mattpocock:bundled returns all 27 enabled skills
    const listWithoutFs = await registeredProvider.list({});
    assert.equal(listWithoutFs.length, 27);

    // 2. When "filesystem" provider IS registered in ctx.skills and linkToDshSkills=true,
    // mattpocock:bundled yields for the 26 symlinked skills and only returns the 1 unlinked colliding skill ("tdd")
    globalProviders.set("filesystem", { provider: { name: "filesystem" } });
    const listWithFs = await registeredProvider.list({});
    assert.equal(listWithFs.length, 1);
    assert.equal(listWithFs[0].name, "tdd");

    // Loading a skill definition via get() works and returns full content + resourceBase
    const loaded = await registeredProvider.get(listWithFs[0]);
    assert.equal(loaded.name, "tdd");
    assert.equal(loaded.provider, BUNDLED_PROVIDER_NAME);
    assert.equal(loaded.resourceBase.kind, "directory");
    assert.equal(loaded.description.includes("red-green-refactor"), true);
    assert.equal(loaded.content.includes("Test-Driven Development"), true);

    // 3. Simulate live GUI toggle via Volatile update: linkToDshSkills -> false, enableInProgress -> true
    volatileConfig.linkToDshSkills.set(false);
    volatileConfig.enableInProgress.set(true);
    listeners.get("loader/volatile-update")();
    await instance.getSyncPromise();

    // Symlinks in dshSkillsDir must be removed, and mattpocock:bundled now serves all 34 skills directly
    assert.equal(existsSync(join(dshSkillsDir, "grill-with-docs")), false);
    const listBundledOnly = await registeredProvider.list({});
    assert.equal(listBundledOnly.length, 34);

    // 4. Re-enable linkToDshSkills -> true, then test M1 dispose guard:
    volatileConfig.linkToDshSkills.set(true);
    listeners.get("loader/volatile-update")();
    await instance.getSyncPromise();
    assert.equal(existsSync(join(dshSkillsDir, "grill-with-docs")), true);

    // Normal process shutdown (disabled === false): symlinks must NOT be deleted
    for (const cleanup of effects) cleanup();
    assert.equal(existsSync(join(dshSkillsDir, "grill-with-docs")), true);

    // Explicit plugin disable at runtime (disabled === true): managed symlinks ARE deleted
    mockCtx.fiber.entry.options.disabled = true;
    for (const cleanup of effects) cleanup();
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(existsSync(join(dshSkillsDir, "grill-with-docs")), false);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
