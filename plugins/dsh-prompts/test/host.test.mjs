import test from "node:test";
import assert from "node:assert/strict";
import { apply, STATE_PATH, ACTION_PATH } from "../lib/index.js";

function createHostHarness({
  initialRecord = null,
  workspaces = [],
  sessionCwds = new Map(),
  liveAgents = new Map(),
} = {}) {
  const routes = new Map();
  const sections = new Map();
  const stored = new Map();
  if (initialRecord) stored.set("prompts-config", initialRecord);
  let settingsConfig = null;
  let promptChangeCount = 0;

  const ctx = {
    fiber: { id: "fiber-test" },
    configEditor: { documentPath: "/tmp/dsh-test-profile/cordis.yml" },
    settings: {
      configure(cfg) {
        settingsConfig = cfg;
        return () => {};
      },
    },
    workspaceRegistry: {
      list() {
        return workspaces;
      },
    },
    workingDirectory: {
      get(session) {
        return sessionCwds.get(session?.id) || session?.header?.cwd || "";
      },
    },
    agents: {
      get(sessionId) {
        return liveAgents.get(sessionId);
      },
    },
    systemPrompt: {
      section(spec) {
        sections.set(spec.name, spec);
        return () => sections.delete(spec.name);
      },
    },
    storageDomain: {
      async open() {
        return {
          tables: new Map([
            [
              "state",
              {
                get(key) {
                  return stored.get(key);
                },
                async put(key, val) {
                  stored.set(key, val);
                },
              },
            ],
          ]),
          async close() {},
        };
      },
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    effect(fn) {
      fn();
    },
    inject(deps, cb) {
      cb(ctx);
    },
    emit(ev) {
      if (ev === "system-prompt/change") promptChangeCount += 1;
    },
  };

  return {
    ctx,
    routes,
    sections,
    stored,
    getSettingsConfig: () => settingsConfig,
    getPromptChangeCount: () => promptChangeCount,
  };
}

test("Host plugin registers prefix (100) and suffix (10150) sections with interpolate: false and updates existing/new sessions in real time", async () => {
  const sessionCwds = new Map([
    ["sess-existing", "/Users/xing/Projects/repo-a/sub"],
    ["sess-new", "/Users/xing/Projects/repo-b"],
  ]);
  const harness = createHostHarness({
    workspaces: [
      { id: "ws-a", title: "Repo A", path: "/Users/xing/Projects/repo-a", sessionIds: ["sess-existing"] },
      { id: "ws-b", title: "Repo B", path: "/Users/xing/Projects/repo-b", sessionIds: ["sess-new"] },
    ],
    sessionCwds,
  });

  await apply(harness.ctx);

  assert.deepEqual(harness.getSettingsConfig(), { auto: false });
  const prefixSpec = harness.sections.get("dsh-prompts:prefix");
  const suffixSpec = harness.sections.get("dsh-prompts:suffix");
  assert.ok(prefixSpec);
  assert.ok(suffixSpec);
  assert.equal(prefixSpec.order, 100);
  assert.equal(prefixSpec.interpolate, false);
  assert.equal(suffixSpec.order, 10150);
  assert.equal(suffixSpec.interpolate, false);

  // Initially no prompts configured -> both sessions get ""
  assert.equal(suffixSpec.text({ agent: { session: { id: "sess-existing" } } }), "");

  const actionRoute = harness.routes.get(ACTION_PATH);
  const stateRoute = harness.routes.get(STATE_PATH);
  assert.ok(actionRoute);
  assert.ok(stateRoute);

  // Reject cross-site requests
  const crossRes = await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: JSON.stringify({ type: "clearGlobalItems" }),
    })
  );
  assert.equal(crossRes.status, 403);

  // 1. Add a global prompt and a Repo A workspace prompt via RPC
  const addGlobalRes = await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "upsertGlobalItem",
        item: {
          title: "Global Rule",
          content: "Always use {{Chinese}}.",
          position: "suffix",
        },
      }),
    })
  );
  assert.equal(addGlobalRes.status, 200);

  const addWsRes = await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "upsertWorkspaceItem",
        workspacePath: "/Users/xing/Projects/repo-a",
        workspaceTitle: "Repo A",
        item: {
          title: "Repo A Rule",
          content: "Run go test ./...",
          position: "suffix",
        },
      }),
    })
  );
  assert.equal(addWsRes.status, 200);

  // Existing session in Repo A immediately gets both Global + Repo A instructions on next step
  const existingPrompt = suffixSpec.text({ agent: { session: { id: "sess-existing" } } });
  assert.match(existingPrompt, /status="active"/);
  assert.match(existingPrompt, /Always use \{\{Chinese\}\}\./);
  assert.match(existingPrompt, /Run go test \.\//);

  // New session in Repo B immediately gets Global instructions only
  const newPrompt = suffixSpec.text({ agent: { session: { id: "sess-new" } } });
  assert.match(newPrompt, /Always use \{\{Chinese\}\}\./);
  assert.doesNotMatch(newPrompt, /Run go test \.\//);

  // 2. Clear both global and Repo A prompts -> sess-existing gets status="cleared", while a fresh session sess-fresh gets ""
  await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "clearGlobalItems" }),
    })
  );
  await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "clearWorkspaceItems",
        workspacePath: "/Users/xing/Projects/repo-a",
      }),
    })
  );

  const existingAfterClear = suffixSpec.text({ agent: { session: { id: "sess-existing" } } });
  assert.match(existingAfterClear, /status="cleared"/);
  assert.equal(suffixSpec.text({ agent: { session: { id: "sess-fresh" } } }), "");
});

test("Host plugin supports targeted subagent injection (agentScope: all | main | subagent) and parent-lineage cwd fallback", async () => {
  const sessionCwds = new Map([["sess-parent", "/Users/xing/Projects/repo-a"]]);
  const liveAgents = new Map([
    [
      "sess-parent",
      {
        id: "sess-parent",
        session: { id: "sess-parent", header: { cwd: "/Users/xing/Projects/repo-a" } },
      },
    ],
  ]);
  const harness = createHostHarness({
    workspaces: [{ id: "ws-a", title: "Repo A", path: "/Users/xing/Projects/repo-a" }],
    sessionCwds,
    liveAgents,
  });

  await apply(harness.ctx);
  const suffixSpec = harness.sections.get("dsh-prompts:suffix");
  const actionRoute = harness.routes.get(ACTION_PATH);

  // Add 3 rules: one for all, one for main only, one for subagent only
  for (const item of [
    { title: "All Rule", content: "Shared rule for all agents.", agentScope: "all" },
    { title: "Main Rule", content: "Never spawn subagents without permission.", agentScope: "main" },
    { title: "Subagent Rule", content: "Return concise findings to parent.", agentScope: "subagent" },
  ]) {
    await actionRoute.fetch(
      new Request("http://127.0.0.1" + ACTION_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "upsertGlobalItem", item }),
      })
    );
  }

  // Add workspace rule for Repo A targeted at subagent
  await actionRoute.fetch(
    new Request("http://127.0.0.1" + ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "upsertWorkspaceItem",
        workspacePath: "/Users/xing/Projects/repo-a",
        workspaceTitle: "Repo A",
        item: {
          title: "Repo A Subagent Rule",
          content: "Inspect Repo A modules only.",
          agentScope: "subagent",
        },
      }),
    })
  );

  // 1. Top-level main agent receives "all" + "main", and NOT "subagent"
  const mainPrompt = suffixSpec.text({
    agent: {
      session: { id: "sess-parent", header: { cwd: "/Users/xing/Projects/repo-a" } },
    },
  });
  assert.match(mainPrompt, /Shared rule for all agents\./);
  assert.match(mainPrompt, /Never spawn subagents without permission\./);
  assert.doesNotMatch(mainPrompt, /Return concise findings to parent\./);
  assert.doesNotMatch(mainPrompt, /Inspect Repo A modules only\./);

  // 2. Child subagent (with origin="subagent", delegationDepth=1, and parentSession="sess-parent" without direct cwd)
  // inherits parent cwd via liveAgents and receives "all" + "subagent", and NOT "main"
  const subagentPrompt = suffixSpec.text({
    agent: {
      session: {
        id: "sess-child-1",
        header: {
          origin: "subagent",
          delegationDepth: 1,
          parentSession: "sess-parent",
        },
      },
    },
  });
  assert.match(subagentPrompt, /Shared rule for all agents\./);
  assert.match(subagentPrompt, /Return concise findings to parent\./);
  assert.match(subagentPrompt, /Inspect Repo A modules only\./);
  assert.doesNotMatch(subagentPrompt, /Never spawn subagents without permission\./);
});
