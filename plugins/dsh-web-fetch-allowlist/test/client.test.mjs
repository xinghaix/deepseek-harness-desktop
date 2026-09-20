import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const source = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const SLOT = "plugins.bundle.config";

// Execute the shipped browser entry; only the new plugin-manager slot is declared.
function harness() {
  let plugin;
  let snapshot = { status: "ready", writable: true, value: { hosts: "example.com" }, user: { hosts: "example.com" }, base: { hosts: "" } };
  const listeners = new Set();
  const entries = new Map();
  const waiting = [];
  const disposers = [];
  const effects = [];
  const writes = [];
  let failSave = false;
  let resolvedRejection = false;
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async set(key, value) { if (resolvedRejection) return; if (failSave) throw new Error("rejected"); writes.push(["set", key, value]); snapshot = { ...snapshot, value: { hosts: value }, user: { hosts: value } }; listeners.forEach(fn => fn()); },
    async unset(key) { if (resolvedRejection) return; writes.push(["unset", key]); snapshot = { ...snapshot, value: snapshot.base, user: {} }; listeners.forEach(fn => fn()); },
  };
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(definition) { plugin = definition.factory(name => {
      if (name === "react") return { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useEffect: fn => effects.push(fn) };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@deepseek-ai/dsh-client-ui-primitives") return { IconChevronDownOutline14: () => null };
      if (name === "@deepseek-ai/dsh-client-store") return { createSnapshotStore(value) { return { getSnapshot: () => value, subscribe: () => () => {}, set(next) { value = next; } }; } };
      throw new Error("Unexpected import: " + name);
    }); } } },
  });
  const ctx = {
    effect(fn) { const off = fn(); if (typeof off === "function") disposers.push(off); },
    locale: { register: () => () => {} },
    settingsScope: { bind(spec) { assert.equal(spec.namespace, "web-fetch-allowlist"); return scope; } },
    slots: {
      inject(name, fn) { waiting.push({ name, fn }); },
      register(spec, component) { entries.set(spec.key, { spec, component }); return () => entries.delete(spec.key); },
    },
  };
  plugin.apply(ctx);
  return {
    entries, writes, effects, listeners,
    declareSlot() { for (const { name, fn } of waiting) if (name === SLOT) { const result = fn(); if (typeof result === "function") disposers.push(result); else if (result?.next) for (const off of result) disposers.push(off); } },
    disable() { disposers.reverse().forEach(off => off()); },
    setReadOnly() { snapshot = { ...snapshot, writable: false }; listeners.forEach(fn => fn()); },
    rejectSaves() { failSave = true; },
    rejectWithRecovery() { resolvedRejection = true; },
    entry() { const entry = entries.get(manifest.name); assert.ok(entry, "plugin settings must be reachable by installed bundle package name"); return entry; },
  };
}
function face(entry) { return entry.spec.inject(); }
function render(entry, props, view = "page") {
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  return expand(entry.component({ ...props, view, t: key => key, useAllowlistCard: select => select(props.hooks.allowlistCard.getSnapshot()) }));
}
function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}

test("new manager discovers configuration after delayed slot declaration and removes it on unload", () => {
  const h = harness();
  assert.equal(h.entries.size, 0);
  h.declareSlot();
  assert.equal(h.entry().spec.name, SLOT);
  assert.equal(h.entries.size, 1);
  h.disable();
  assert.equal(h.entries.size, 0);
  assert.equal(h.listeners.size, 0);
});

test("manifest loads plugin manager, not the removed settings card owner", () => {
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-plugin-manager"));
  assert.ok(!manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-settings-plugins"));
});

test("summary is text only; page exposes the form without a second expand click", () => {
  const h = harness(); h.declareSlot(); const entry = h.entry(); const props = face(entry);
  assert.equal(render(entry, props, "summary"), "description");
  const page = render(entry, props);
  assert.equal(nodes(page, "input")[0].props.value, "example.com");
  assert.equal(nodes(page, "li").length, 0);
  assert.ok(nodes(page, "button").some(node => node.props.children === "save"));
});

test("edits are staged and only save writes the existing namespace", async () => {
  const h = harness(); h.declareSlot(); const props = face(h.entry());
  props.editRow(0, "example.org");
  assert.deepEqual(h.writes, []);
  await props.save();
  assert.deepEqual(h.writes, [["set", "hosts", "example.org"]]);
  assert.equal(props.hooks.allowlistCard.getSnapshot().dirty, false);
});

test("read-only settings cannot be saved", async () => {
  const h = harness(); h.declareSlot(); h.setReadOnly(); const entry = h.entry(); const props = face(entry);
  props.editRow(0, "example.org");
  const page = render(entry, props);
  assert.ok(nodes(page, "input").every(node => node.props.disabled));
  assert.ok(nodes(page, "button").find(node => node.props.children === "save").props.disabled);
  await props.save(); assert.deepEqual(h.writes, []);
});

test("failed save retains the draft for correction", async () => {
  const h = harness(); h.declareSlot(); h.rejectSaves(); const props = face(h.entry());
  props.editRow(0, "example.org"); await props.save();
  const state = props.hooks.allowlistCard.getSnapshot();
  assert.equal(state.failed, true); assert.equal(state.hosts.text, "example.org"); assert.equal(state.dirty, true);
});

test("reset remains staged until save clears the user override", async () => {
  const h = harness(); h.declareSlot(); const props = face(h.entry());
  props.resetField(); assert.deepEqual(h.writes, []); await props.save();
  assert.deepEqual(h.writes, [["unset", "hosts"]]);
});

test("resolved rejected writes keep drafts, including reset overrides", async () => {
  for (const reset of [false, true]) {
    const h = harness(); h.declareSlot(); h.rejectWithRecovery(); const props = face(h.entry());
    if (reset) props.resetField(); else props.editRow(0, "example.org");
    await props.save();
    const state = props.hooks.allowlistCard.getSnapshot();
    assert.equal(state.failed, true, "settingsScope can resolve after a rejected remote write");
    assert.equal(state.dirty, true);
    assert.equal(state.hosts.text, reset ? "" : "example.org");
  }
});

test("injected actions keep stable identity and rerenders preserve staged values", () => {
  const h = harness(); h.declareSlot(); const entry = h.entry(); const props = face(entry);
  props.editRow(0, "example.org");
  const again = face(entry);
  assert.equal(props.discard, again.discard);
  assert.equal(nodes(render(entry, again), "input")[0].props.value, "example.org");
});

test("leaving the page discards unsaved changes without writing", () => {
  const h = harness(); h.declareSlot(); const entry = h.entry(); const props = face(entry);
  render(entry, props); const cleanups = h.effects.map(fn => fn()).filter(fn => typeof fn === "function");
  props.editRow(0, "example.org"); cleanups.forEach(fn => fn());
  assert.equal(props.hooks.allowlistCard.getSnapshot().hosts.text, "example.com");
  assert.deepEqual(h.writes, []);
});
