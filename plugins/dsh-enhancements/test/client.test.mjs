import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");

function observable(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(next) { value = next; for (const fn of [...listeners]) fn(); },
    listeners,
  };
}

function harness() {
  const config = observable({ status: "ready", writable: true, value: { archiveManager: true } });
  const sessions = observable({ phase: "ready", ids: ["a", "b"], byId: { a: { displayTitle: "Alpha", cwd: "/a", updatedAt: 2 }, b: { displayTitle: "Beta", updatedAt: 1 } } });
  const workspaces = observable({ phase: "ready", state: "idle", archivedSessionIds: ["a", "b"], items: [] });
  const locale = observable({ active: "en" });
  const access = new Map(["a", "b"].map(id => [id, observable(true)]));
  const entries = new Map();
  const declared = new Set();
  const waits = [];
  const offs = [];
  const dictionaries = new Map();
  const writes = [];
  const restored = [];
  const restoreFailures = new Set();
  let serviceSetup;
  let serviceCleanup;
  let refuseWrite = false;
  let pendingRestore;
  let calls = 0;
  let plugin;
  const React = {
    createElement(type, props, ...children) { return { type, props: { ...props, children: children.length === 1 ? children[0] : children } }; },
    useState: value => [value, () => {}],
    useEffect: () => {},
    useId: () => "test-id",
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(entry) { assert.equal(entry.id, manifest.name); calls++; plugin = entry.factory(name => {
      if (name === "react") return React;
      if (name === "@deepseek-ai/dsh-client-store") return { createSnapshotStore: observable };
      if (name === "@deepseek-ai/dsh-client-ui-primitives") return { Modal: props => props.open ? React.createElement("dialog", props, props.children, props.footer) : null };
      throw new Error("Unexpected browser import " + name);
    }); } } },
  });
  const form = {
    ...config,
    async set(key, value) {
      writes.push([key, value]);
      if (refuseWrite) return false;
      config.set({ ...config.getSnapshot(), value: { archiveManager: value } });
      return true;
    },
  };
  const ctx = {
    effect(fn) { const off = fn(); if (typeof off === "function") offs.push(off); },
    locale: {
      ...locale,
      register(ns, id, dict) { assert.equal(ns, manifest.name); dictionaries.set(id, dict); return () => dictionaries.delete(id); },
      bind: () => key => dictionaries.get(locale.getSnapshot().active)?.[key] || dictionaries.get("en")?.[key] || key,
    },
    configForms: { get(ns) { assert.equal(ns, manifest.name); return form; } },
    slots: {
      inject(name, setup) { const wait = { name, setup, off: null }; waits.push(wait); if (declared.has(name)) wait.off = setup(); },
      register(spec, component) {
        const id = spec.key || spec.id;
        assert.ok(declared.has(spec.name));
        assert.ok(!entries.has(id), "duplicate registration");
        const entry = { spec, component };
        entries.set(id, entry);
        return () => { if (entries.get(id) === entry) entries.delete(id); };
      },
    },
    inject(keys, setup) { assert.deepEqual(Array.from(keys), ["sessions", "workspaces", "remoteAccess"]); serviceSetup = setup; },
  };
  plugin.apply(ctx);
  const services = {
    sessions: { list: sessions },
    workspaces: {
      list: workspaces,
      async unarchiveSession(id) {
        restored.push(id);
        if (pendingRestore) await pendingRestore;
        if (restoreFailures.has(id)) throw new Error("Host refused restore");
        const old = workspaces.getSnapshot();
        workspaces.set({ ...old, archivedSessionIds: old.archivedSessionIds.filter(item => item !== id) });
      },
    },
    remoteAccess: { source(kind, id, action) { assert.equal(kind, "session"); assert.equal(action, "workspace/unarchiveSession"); return access.get(id) || observable(false); } },
  };
  return {
    config, sessions, workspaces, locale, access, entries, dictionaries, writes, restored, restoreFailures, calls,
    declare(name) { declared.add(name); for (const wait of waits) if (wait.name === name) wait.off = wait.setup(); },
    withdraw(name) { declared.delete(name); for (const wait of waits) if (wait.name === name) { wait.off?.(); wait.off = null; } },
    attach() { serviceCleanup = serviceSetup(services); },
    detach() { serviceCleanup?.(); serviceCleanup = null; },
    disable() { serviceCleanup?.(); serviceCleanup = null; for (const wait of [...waits].reverse()) { wait.off?.(); wait.off = null; } for (const off of offs.reverse()) off(); },
    controller() { return entries.get(manifest.name).spec.inject().controller; },
    rejectWrites() { refuseWrite = true; },
    holdRestore(promise) { pendingRestore = promise; },
  };
}
function start() {
  const h = harness();
  h.declare("plugins.bundle.config");
  h.declare("settings.section");
  h.attach();
  return h;
}

function render(entry, props = {}) {
  const expand = node => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  };
  return expand(entry.component({ ...entry.spec.inject(), view: "page", t: key => key, ...props }));
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

test("bundle is standard, exact-runtime gated and independent of desktop controls", () => {
  assert.equal(manifest.engines.dsh, "0.2.1-rc.2");
  assert.equal(manifest.dsh.engines, undefined);
  assert.equal(manifest.dsh.client.platform, "web");
  assert.ok(manifest.dsh.bundle.patch);
  assert.ok(manifest.dependencies["@deepseek-ai/schemastery"]);
  assert.doesNotMatch(source, /desktop-bridge|__DSH_DESKTOP|Wails|fetch\(|MutationObserver|__reactFiber|localStorage|rmSync|unlink/);
  assert.equal(harness().calls, 1);
});

test("late slots and services show independent readiness, and unload removes all registrations", () => {
  const h = harness();
  assert.equal(h.entries.size, 0);
  h.declare("plugins.bundle.config"); const c = h.controller();
  assert.equal(c.getSnapshot().reason, "reasonServices");
  h.attach(); assert.equal(c.getSnapshot().reason, "reasonSlot");
  h.declare("settings.section"); assert.equal(c.getSnapshot().reason, null);
  h.withdraw("settings.section"); assert.equal(c.getSnapshot().reason, "reasonSlot");
  h.declare("settings.section"); assert.equal(c.getSnapshot().reason, null);
  h.disable();
  assert.equal(h.entries.size, 0);
  assert.equal(h.dictionaries.size, 0);
  for (const source of [h.config, h.sessions, h.workspaces, h.locale, ...h.access.values()]) assert.equal(source.listeners.size, 0);
});

test("settings writes use the existing config form and refused writes preserve accepted state", async () => {
  const h = start(); const c = h.controller();
  h.rejectWrites(); await c.setEnabled(false);
  assert.equal(c.getSnapshot().saveFailed, true);
  assert.equal(c.getSnapshot().config.value.archiveManager, true);
  assert.deepEqual(h.writes, [["archiveManager", false]]);
  h.config.set({ ...h.config.getSnapshot(), writable: false });
  await c.setEnabled(false);
  assert.equal(h.writes.length, 1);
});

test("disabled and unavailable settings never allow a restore", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  await c.setEnabled(false);
  assert.equal(c.getSnapshot().reason, "reasonDisabled");
  assert.equal(await c.restore(["a", "b"]), false);
  h.config.set({ ...h.config.getSnapshot(), status: "unavailable", value: { archiveManager: true } });
  assert.equal(c.getSnapshot().reason, "reasonSettings");
  assert.equal(await c.restore(["a", "b"]), false);
  assert.deepEqual(h.restored, []);
});

test("filtering preserves hidden selections; restore uses captured selection and official service", async () => {
  const h = start(); const c = h.controller();
  c.toggle("b", true); c.setQuery("Alpha"); c.selectVisible();
  assert.deepEqual(Array.from(c.getSnapshot().selected).sort(), ["a", "b"]);
  assert.equal(await c.restore(["a"]), false, "confirmation cannot silently change selection");
  assert.equal(await c.restore(["b", "a"]), true);
  assert.deepEqual(h.restored, ["b", "a"]);
  assert.equal(c.getSnapshot().selected.length, 0);
  assert.equal(c.getSnapshot().batch.restored.length, 2);
});

test("permission changes are reactive and rechecked at execution time", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  h.access.get("a").set(false);
  assert.equal(c.getSnapshot().rows.find(row => row.id === "a").allowed, false);
  await c.restore(["a", "b"]);
  assert.deepEqual(h.restored, ["b"]);
  assert.equal(c.getSnapshot().batch.failed[0].reason, "permissionDenied");
});

test("selection prunes removed ids and confirmation cannot restore a stale selection", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  h.workspaces.set({ ...h.workspaces.getSnapshot(), archivedSessionIds: ["b"] });
  assert.deepEqual(Array.from(c.getSnapshot().selected), ["b"]);
  assert.equal(await c.restore(["a", "b"]), false);
  assert.deepEqual(h.restored, []);
});

test("service loss stops the batch after the admitted item and leaves late UI writes inert", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  let done; h.holdRestore(new Promise(resolve => { done = resolve; }));
  const pending = c.restore(["a", "b"]);
  h.detach();
  assert.equal(c.getSnapshot().reason, "reasonServices");
  done(); await pending;
  assert.deepEqual(h.restored, ["a"]);
  assert.equal(c.getSnapshot().batch.cancelled, true);
});

test("settings and archived page render actionable states with no delete button", () => {
  const h = start(); const c = h.controller();
  const settings = render(h.entries.get(manifest.name));
  assert.equal(nodes(settings, "input")[0].props.checked, true);
  const archives = render(h.entries.get("dsh-enhancements.archives"));
  assert.equal(nodes(archives, "li").length, 2);
  assert.ok(nodes(archives, "button").find(node => node.props.children === "restoreSelected").props.disabled);
  assert.ok(!nodes(archives, "button").some(node => /delete/i.test(String(node.props.children))));
  assert.equal(c.getSnapshot().rows.length, 2);
});

test("locale changes refresh nav labels without losing pending consent or selection", () => {
  const h = start(); const entry = h.entries.get("dsh-enhancements.archives");
  const c = h.controller(); c.toggle("a", true); c.requestConfirmation();
  assert.equal(entry.spec.label(), "Archived sessions");
  h.locale.set({ active: "zh" });
  const next = h.entries.get("dsh-enhancements.archives");
  assert.equal(h.entries.size, 2);
  assert.notEqual(next, entry);
  assert.equal(next.spec.label(), h.dictionaries.get("zh").archivesTitle);
  assert.deepEqual(Array.from(c.getSnapshot().confirmation), ["a"]);
  assert.deepEqual(Array.from(c.getSnapshot().selected), ["a"]);
  assert.equal(nodes(render(next), "dialog").length, 1);
  c.dismissConfirmation();
  assert.equal(nodes(render(next), "dialog").length, 0);
  h.disable(); assert.equal(h.locale.listeners.size, 0);
});

test("confirmation rejects an enlarged selection even when all original ids remain selected", async () => {
  const h = start(); const c = h.controller();
  c.toggle("a", true); c.requestConfirmation(); c.toggle("b", true);
  assert.equal(await c.confirmRestore(), false);
  assert.equal(c.getSnapshot().confirmChanged, true);
  assert.deepEqual(h.restored, []);
});

test("failed items remain selectable for retry after a partial batch", async () => {
  const h = start(); const c = h.controller();
  h.restoreFailures.add("a"); c.selectVisible();
  await c.restore(["a", "b"]);
  assert.equal(c.getSnapshot().batch.failed.length, 1);
  c.selectFailed();
  assert.deepEqual(Array.from(c.getSnapshot().selected), ["a"]);
  h.restoreFailures.delete("a");
  c.requestConfirmation(); assert.equal(await c.confirmRestore(), true);
  assert.deepEqual(Array.from(c.getSnapshot().batch.restored), ["a"]);
  assert.equal(c.getSnapshot().batch.failed.length, 0);
});

test("workspace failure before the first baseline reports connection failure and refuses restore", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  h.workspaces.set({ ...h.workspaces.getSnapshot(), phase: "pending", state: "error" });
  assert.equal(c.getSnapshot().reason, "reasonConnection");
  assert.equal(await c.restore(["a", "b"]), false);
  assert.deepEqual(h.restored, []);
});

test("stopping state survives page re-registration while the admitted request settles", async () => {
  const h = start(); const c = h.controller(); c.selectVisible();
  let finish; h.holdRestore(new Promise(resolve => { finish = resolve; }));
  const pending = c.restore(["a", "b"]);
  c.stop();
  h.locale.set({ active: "zh" });
  assert.equal(c.getSnapshot().batch.stopping, true);
  const page = render(h.entries.get("dsh-enhancements.archives"));
  assert.ok(nodes(page, "button").find(node => node.props.children === "stopRequested").props.disabled);
  finish(); await pending;
  assert.equal(c.getSnapshot().batch.stopping, false);
  assert.deepEqual(h.restored, ["a"]);
});
