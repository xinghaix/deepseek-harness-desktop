import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function renderVNodeToText(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderVNodeToText).join("");
  if (typeof node.type === "function") {
    return renderVNodeToText(node.type(node.props || {}));
  }
  const children = node.props?.children;
  return renderVNodeToText(children);
}

function loadClientModule() {
  let registered = null;
  const fakeReact = {
    Fragment: ({ children }) => children,
    createElement(type, props, ...children) {
      const flat = children.flat(Infinity);
      return {
        type,
        props: {
          ...(props || {}),
          children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
        },
      };
    },
    useSyncExternalStore(_sub, getSnap) {
      return getSnap();
    },
  };

  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(entry) {
          registered = entry;
        },
      },
    },
    fetch: globalThis.fetch,
  });

  assert.ok(registered);
  assert.equal(registered.id, "dsh-prompts");

  const fakeRequire = (id) => {
    if (id === "react") return fakeReact;
    if (id === "@deepseek-ai/dsh-client-store") {
      return {
        createSnapshotStore(initial) {
          let current = initial;
          const subs = new Set();
          return {
            getSnapshot: () => current,
            set(next) {
              current = next;
              for (const fn of subs) fn();
            },
            subscribe(fn) {
              subs.add(fn);
              return () => subs.delete(fn);
            },
          };
        },
      };
    }
    if (id === "@deepseek-ai/dsh-client-ui-primitives") {
      return {
        Modal: ({ open, children }) =>
          open ? fakeReact.createElement("div", { "data-modal": "true" }, children) : null,
      };
    }
    throw new Error(`Unexpected require: ${id}`);
  };

  return { mod: registered.factory(fakeRequire), React: fakeReact };
}

test("Client plugin registers all 8 locales, settings.section, plugins.bundle.config, and renders unified tabs", async () => {
  const { mod, React } = loadClientModule();
  const localeMap = new Map();
  const slotMap = new Map();

  let serverState = {
    version: 1,
    revision: 2,
    enabled: true,
    showInSettings: true,
    showInSidebar: false,
    globalItems: [
      {
        id: "g1",
        title: "中文与结论先行",
        content: "始终使用简体中文回答。",
        enabled: true,
        position: "suffix",
        updatedAt: 1000,
      },
    ],
    workspaces: {},
  };

  const fakeFetch = async (_url, init) => {
    if (init?.method === "POST") {
      const body = JSON.parse(init.body);
      if (body.type === "setOptions" && typeof body.showInSidebar === "boolean") {
        serverState = { ...serverState, showInSidebar: body.showInSidebar };
      }
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          state: serverState,
          workspaces: [
            {
              workspaceId: "ws-1",
              title: "deepseek-harness-desktop",
              path: "/Users/xing/Projects/github/deepseek-harness-desktop",
              sessionIds: ["s-1"],
            },
          ],
        };
      },
    };
  };

  const ctx = {
    effect(fn) {
      fn();
    },
    locale: {
      register(_ns, langOrObj, maybeDict) {
        if (typeof langOrObj === "string") {
          localeMap.set(langOrObj, maybeDict);
        } else {
          for (const [k, v] of Object.entries(langOrObj)) localeMap.set(k, v);
        }
        return () => {};
      },
      getSnapshot: () => ({ active: "zh" }),
      subscribe: () => () => {},
    },
    slots: {
      inject(_name, fn) {
        return fn();
      },
      register(spec, Component) {
        const key = `${spec.name}:${spec.id || spec.key}`;
        slotMap.set(key, { spec, Component });
        return () => slotMap.delete(key);
      },
    },
    inject(_deps, fn) {
      fn({
        workspaces: {
          list: {
            getSnapshot: () => ({
              items: [
                {
                  workspaceId: "ws-1",
                  title: "deepseek-harness-desktop",
                  path: "/Users/xing/Projects/github/deepseek-harness-desktop",
                  sessionIds: ["s-1"],
                },
              ],
            }),
            subscribe: () => () => {},
          },
        },
        sessions: {
          list: {
            getSnapshot: () => ({ activeSessionId: "s-1", items: [{ sessionId: "s-1" }] }),
            subscribe: () => () => {},
          },
        },
        uiWorkspace: {
          pickDirectory: async () => "/Users/xing/Projects/new-ws",
        },
      });
    },
  };

  const controller = mod.apply(ctx, { fetch: fakeFetch });
  await controller.load();

  // Verify all 8 locales registered
  for (const lang of ["zh", "en", "de", "fr", "es", "ja", "ko", "pt"]) {
    assert.ok(localeMap.has(lang), `missing locale ${lang}`);
  }

  // Verify settings.section and plugins.bundle.config slots
  assert.ok(slotMap.has("settings.section:dsh-prompts"));
  assert.ok(slotMap.has("plugins.bundle.config:dsh-prompts"));
  assert.ok(slotMap.has("plugins.row.config:dsh-prompts#dsh-prompts"));
  assert.equal(slotMap.has("sidebar.panellist:dsh-prompts"), false);

  const bundleSlot = slotMap.get("plugins.bundle.config:dsh-prompts");
  assert.equal(bundleSlot.Component({ view: "summary" }), "已启用 · 1 条全局 · 0 个工作区");

  const settingsSlot = slotMap.get("settings.section:dsh-prompts");
  assert.equal(settingsSlot.spec.label(), "提示词");

  const textGlobal = renderVNodeToText(React.createElement(settingsSlot.Component, {}));
  assert.match(textGlobal, /提示词管理/);
  assert.match(textGlobal, /全局提示词 \(1\)/);
  assert.match(textGlobal, /工作区提示词 \(0\)/);
  assert.match(textGlobal, /中文与结论先行/);

  // Verify bundle view omits duplicate top heading (host plugin page already renders it)
  const textBundlePage = renderVNodeToText(React.createElement(bundleSlot.Component, { view: "page" }));
  assert.doesNotMatch(textBundlePage, /提示词管理统一配置/);

  // Verify inline expandable creation panel opens and toggles closed cleanly without popup modal
  controller.openEditor({ scope: "global" });
  assert.ok(controller.getSnapshot().editorModal);
  const textWithInlineEditor = renderVNodeToText(React.createElement(settingsSlot.Component, {}));
  assert.match(textWithInlineEditor, /新建全局提示词/);
  controller.openEditor({ scope: "global" }); // second click toggles closed
  assert.equal(controller.getSnapshot().editorModal, null);

  // Verify inline row expansion for editing an existing prompt item and closing it
  controller.openEditor({
    scope: "global",
    item: controller.getSnapshot().state.globalItems[0],
  });
  assert.equal(controller.getSnapshot().expandedItemId, "g1");
  controller.closeEditor();
  assert.equal(controller.getSnapshot().expandedItemId, null);
  assert.equal(controller.getSnapshot().editorModal, null);

  // Switch to workspace tab and verify current session workspace is recognized
  controller.setTab("workspace");
  const textWorkspace = renderVNodeToText(React.createElement(settingsSlot.Component, {}));
  assert.match(textWorkspace, /deepseek-harness-desktop/);
  assert.match(textWorkspace, /当前会话/);

  // Switch to preview tab and verify priority envelope preview renders
  controller.setTab("preview");
  const textPreview = renderVNodeToText(React.createElement(settingsSlot.Component, {}));
  assert.match(textPreview, /<user-custom-instructions slot="suffix" status="active"/);
  assert.match(textPreview, /始终使用简体中文回答。/);

  // Enable sidebar entry and verify sidebar.panellist is dynamically registered
  await controller.mutate({ type: "setOptions", showInSidebar: true });
  assert.equal(slotMap.has("sidebar.panellist:dsh-prompts"), true);
});
