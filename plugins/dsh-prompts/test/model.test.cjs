"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../lib/model.cjs");

test("normalizePath and isSameOrSubPath handle POSIX and Windows paths", () => {
  assert.equal(model.normalizePath("/Users/xing/Projects//repo/"), "/Users/xing/Projects/repo");
  assert.equal(model.normalizePath("C:\\Users\\xing\\Repo\\"), "C:/Users/xing/Repo");
  assert.equal(model.isSameOrSubPath("/Users/xing/Projects/repo/src", "/Users/xing/Projects/repo"), true);
  assert.equal(model.isSameOrSubPath("/Users/xing/Projects/repo-other", "/Users/xing/Projects/repo"), false);
  assert.equal(model.isSameOrSubPath("c:\\users\\xing\\repo\\sub", "C:/Users/xing/Repo"), true);
});

test("matchWorkspaceProfile selects the longest matching parent workspace path", () => {
  let state = model.defaultState();
  state = model.applyMutation(state, {
    type: "upsertWorkspaceItem",
    workspacePath: "/Users/xing/Projects",
    workspaceTitle: "Projects Root",
    item: { title: "Root Rule", content: "Use root conventions" },
  });
  state = model.applyMutation(state, {
    type: "upsertWorkspaceItem",
    workspacePath: "/Users/xing/Projects/github/deepseek-harness-desktop",
    workspaceTitle: "DSH Desktop",
    item: { title: "Repo Rule", content: "Run go test ./..." },
  });

  const matched = model.matchWorkspaceProfile(
    "/Users/xing/Projects/github/deepseek-harness-desktop/internal/dsh",
    state.workspaces
  );
  assert.ok(matched);
  assert.equal(matched.workspaceTitle, "DSH Desktop");
});

test("resolveEffectiveItems and renderPriorityEnvelope support append and override modes", () => {
  let state = model.defaultState();
  state = model.applyMutation(state, {
    type: "upsertGlobalItem",
    item: {
      id: "g1",
      title: "Global Chinese",
      content: "Always reply in Simplified Chinese. Literal {{var}} is preserved.",
      position: "suffix",
    },
  });
  state = model.applyMutation(state, {
    type: "upsertWorkspaceItem",
    workspacePath: "/work/app",
    workspaceTitle: "App",
    item: {
      id: "w1",
      title: "Workspace TDD",
      content: "Always run unit tests after editing.",
      position: "suffix",
    },
  });

  const appendResolved = model.resolveEffectiveItems(state, "/work/app/src", "suffix");
  assert.equal(appendResolved.active, true);
  assert.equal(appendResolved.globalItems.length, 1);
  assert.equal(appendResolved.workspaceItems.length, 1);
  assert.equal(appendResolved.globalItems[0].includeTitle, false);
  const appendEnvelope = model.renderPriorityEnvelope(appendResolved);
  assert.match(appendEnvelope, /<user-custom-instructions slot="suffix" status="active" revision="3">/);
  assert.match(appendEnvelope, /<workspace-instructions> > <global-instructions>/);
  assert.match(appendEnvelope, /<global-instructions>\nAlways reply in Simplified Chinese/);
  assert.doesNotMatch(appendEnvelope, /Global Chinese/);
  assert.match(appendEnvelope, /<workspace-instructions workspace="App" mode="append">/);
  assert.match(appendEnvelope, /Literal \{\{var\}\} is preserved\./);

  // Switch workspace to override mode
  state = model.applyMutation(state, {
    type: "setWorkspacePolicy",
    workspacePath: "/work/app",
    mergeMode: "override",
  });
  const overrideResolved = model.resolveEffectiveItems(state, "/work/app/src", "suffix");
  assert.equal(overrideResolved.globalItems.length, 0);
  assert.equal(overrideResolved.workspaceItems.length, 1);
  const overrideEnvelope = model.renderPriorityEnvelope(overrideResolved);
  assert.doesNotMatch(overrideEnvelope, /\n<global-instructions>\n/);
  assert.doesNotMatch(overrideEnvelope, /<global-instructions>/);
  assert.match(overrideEnvelope, /mode="override"/);

  // Verify includeTitle: true injects the rule title as a ### heading when explicitly enabled
  state = model.applyMutation(state, {
    type: "upsertWorkspaceItem",
    workspacePath: "/work/app",
    workspaceTitle: "App",
    item: {
      id: "w1",
      title: "Explicit Injected Title",
      content: "Always run unit tests after editing.",
      includeTitle: true,
      position: "suffix",
    },
  });
  const withTitleResolved = model.resolveEffectiveItems(state, "/work/app/src", "suffix");
  const withTitleEnvelope = model.renderPriorityEnvelope(withTitleResolved);
  assert.match(withTitleEnvelope, /### Explicit Injected Title\nAlways run unit tests after editing\./);
});

test("createSessionPromptTracker emits status=cleared for existing sessions after clearing prompts, and empty string for clean sessions", () => {
  const tracker = model.createSessionPromptTracker();
  let state = model.defaultState();

  // 1. Clean session s-clean never had prompts -> returns ""
  assert.equal(
    tracker.resolveSlotText(state, { sessionId: "s-clean", cwd: "/work/app", slot: "suffix" }),
    ""
  );

  // 2. Add global prompt -> s-active gets status="active"
  state = model.applyMutation(state, {
    type: "upsertGlobalItem",
    item: { title: "Concise", content: "Be concise.", position: "suffix" },
  });
  const activeText = tracker.resolveSlotText(state, {
    sessionId: "s-active",
    cwd: "/work/app",
    slot: "suffix",
  });
  assert.match(activeText, /status="active"/);
  assert.equal(
    tracker.resolveSlotText(state, { sessionId: "s-active", cwd: "/work/app", slot: "prefix" }),
    ""
  );

  // 3. Clear all global prompts -> s-active receives status="cleared" in suffix, while s-brand-new still gets ""
  state = model.applyMutation(state, { type: "clearGlobalItems" });
  const clearedText = tracker.resolveSlotText(state, {
    sessionId: "s-active",
    cwd: "/work/app",
    slot: "suffix",
  });
  assert.match(clearedText, /<user-custom-instructions slot="suffix" status="cleared" revision="3">/);
  assert.equal(
    tracker.resolveSlotText(state, { sessionId: "s-brand-new", cwd: "/work/app", slot: "suffix" }),
    ""
  );

  // 4. Persisted session resumed from disk with prior system/message marker also receives status="cleared"
  const resumedSession = {
    id: "s-resumed",
    snapshotEvents() {
      return [
        {
          type: "system/message",
          data: {
            message: {
              role: "system",
              content: [
                {
                  type: "text",
                  text: '<user-custom-instructions slot="suffix" status="active" revision="1">\nOld rule\n</user-custom-instructions>',
                },
              ],
            },
          },
        },
      ];
    },
  };
  const resumedCleared = tracker.resolveSlotText(state, {
    sessionId: "s-resumed",
    session: resumedSession,
    cwd: "/work/app",
    slot: "suffix",
  });
  assert.match(resumedCleared, /status="cleared"/);
});
