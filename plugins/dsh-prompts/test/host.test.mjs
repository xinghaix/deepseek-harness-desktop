import test from "node:test";
import assert from "node:assert/strict";
import { apply, STATE_PATH, ACTION_PATH } from "../lib/index.js";

function createHostHarness({ initialRecord = null, workspaces = [], sessionCwds = new Map() } = {}) {
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
