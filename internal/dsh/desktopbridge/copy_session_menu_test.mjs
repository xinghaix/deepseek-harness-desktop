import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
const observers = new Set();
const documentListeners = new Map();
const windowListeners = new Map();
const timers = [];
const scheduleTimer = (fn, delay) => {
  const timer = { fn, delay, cancelled: false };
  timers.push(timer);
  return timer;
};
const cancelTimer = (timer) => {
  if (timer) timer.cancelled = true;
};
let asyncMutationDelivery = false;
let mutationDeliveryScheduled = false;
let mutationDeliveryCount = 0;
let mutationDeliveryLimit = Infinity;
let mutationDeliveryError = null;
const notifyMutation = () => {
  if (!asyncMutationDelivery) {
    for (const observer of [...observers]) observer.callback([]);
    return;
  }
  if (mutationDeliveryScheduled) return;
  mutationDeliveryScheduled = true;
  Promise.resolve().then(() => {
    mutationDeliveryScheduled = false;
    mutationDeliveryCount += 1;
    if (mutationDeliveryCount > mutationDeliveryLimit) {
      mutationDeliveryError = new Error("mutation delivery limit exceeded");
      return;
    }
    for (const observer of [...observers]) observer.callback([]);
  });
};

function splitSelectors(selector) {
  return String(selector).split(",").map((part) => part.trim()).filter(Boolean);
}

function selectorMatches(element, selector) {
  return splitSelectors(selector).some((part) => {
    if (part === "*") return true;
    const bracketStart = part.indexOf("[");
    const base = bracketStart >= 0 ? part.slice(0, bracketStart) : part;
    const bracketEnd = part.lastIndexOf("]");
    const attrExpression = bracketStart >= 0 && bracketEnd > bracketStart ? part.slice(bracketStart + 1, bracketEnd) : "";
    const equals = attrExpression.indexOf("=");
    const attr = equals >= 0 ? attrExpression.slice(0, equals).trim() : attrExpression.trim();
    const expected = equals >= 0
      ? attrExpression.slice(equals + 1).trim().replace(/^[\"']/, "").replace(/[\"']$/, "")
      : undefined;
    const dot = base.indexOf(".");
    const tag = dot >= 0 ? base.slice(0, dot) : base;
    const className = dot >= 0 ? base.slice(dot + 1) : "";
    if (tag && element.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (className && !String(element.className || "").trim().split(" ").includes(className)) return false;
    if (attr && !element.hasAttribute(attr)) return false;
    return !attr || expected === undefined || element.getAttribute(attr) === expected;
  });
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this._textContent = "";
  }

  get className() {
    return this.getAttribute("class") || "";
  }

  set className(value) {
    this.setAttribute("class", value);
  }

  get children() {
    return this.childNodes;
  }

  get isConnected() {
    let current = this;
    while (current.parentElement) current = current.parentElement;
    return current === document.documentElement;
  }

  get textContent() {
    return this._textContent || this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.childNodes = [];
    if (this.isConnected) notifyMutation();
  }

  appendChild(child) {
    if (child.parentElement) child.remove();
    child.parentElement = this;
    this.childNodes.push(child);
    if (this.isConnected) notifyMutation();
    return child;
  }

  before(node) {
    if (!this.parentElement) return;
    if (node.parentElement) node.remove();
    const index = this.parentElement.childNodes.indexOf(this);
    node.parentElement = this.parentElement;
    this.parentElement.childNodes.splice(index, 0, node);
    if (this.isConnected) notifyMutation();
  }
  focus() {}
  select() {}
  setSelectionRange(_start, _end) {}

  remove() {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    const index = parent.childNodes.indexOf(this);
    if (index >= 0) parent.childNodes.splice(index, 1);
    this.parentElement = null;
    if (parent.isConnected) notifyMutation();
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(String(name));
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  cloneNode(deep = false) {
    const clone = new FakeElement(this.tagName);
    for (const [name, value] of this.attributes) clone.setAttribute(name, value);
    clone._textContent = this._textContent;
    if (deep) for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
    return clone;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      for (const child of node.childNodes) {
        if (selectorMatches(child, selector)) result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (selectorMatches(current, selector)) return current;
    }
    return null;
  }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatchEvent(event) {
    event.target ??= this;
    for (const listener of this.listeners.get(event.type) || []) listener(event);
    return true;
  }
}

const document = {
  head: new FakeElement("head"),
  documentElement: new FakeElement("html"),
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  createElementNS(_namespace, tagName) {
    return new FakeElement(tagName);
  },
  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  },
  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  },
  addEventListener(name, listener) {
    documentListeners.set(name, listener);
  },
  removeEventListener(name, listener) {
    if (documentListeners.get(name) === listener) documentListeners.delete(name);
  },
};

const navigator = {
  clipboard: {
    writeText() {
      return Promise.resolve();
    },
  },
};
const window = {
  addEventListener(name, listener) {
    if (!windowListeners.has(name)) windowListeners.set(name, new Set());
    windowListeners.get(name).add(listener);
  },
  removeEventListener(name, listener) {
    windowListeners.get(name)?.delete(listener);
  },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) || []) listener(event);
  },
  setTimeout: scheduleTimer,
  clearTimeout: cancelTimer,
  __ModuleLoader__: {
    load(value) {
      registration = value;
    },
  },
};

class MutationObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() {
    observers.add(this);
  }
  disconnect() {
    observers.delete(this);
  }
}

let registration;
const sandbox = {
  window,
  document,
  MutationObserver,
  navigator,
  queueMicrotask: (fn) => fn(),
  setTimeout: scheduleTimer,
  clearTimeout: cancelTimer,
  console,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "desktop-bridge-copy-session-menu.js" });
assert.ok(registration, "client registration missing");

const reactStates = [];
const react = {
  useState(init) {
    const index = reactStates.length;
    const value = typeof init === "function" ? init() : init;
    reactStates.push({ value });
    return [
      reactStates[index].value,
      (next) => {
        reactStates[index].value = typeof next === "function" ? next(reactStates[index].value) : next;
      },
    ];
  },
  useEffect(fn) {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  },
};
function MenuItemButton(props) { return { type: "MenuItemButton", props }; }
function IconCopyOutlineRegular() { return { type: "IconCopy" }; }
function IconTrashOutlineRegular() { return { type: "IconTrash" }; }
let clipboardValue = "";
let clipboardRejects = false;
sandbox.navigator.clipboard.writeText = (value) => {
  if (clipboardRejects) return Promise.reject(new Error("clipboard denied"));
  clipboardValue = value;
  return Promise.resolve();
};
const slotRegistrations = [];
const client = registration.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") {
    return {
      jsx(type, props) { return { type, props: props || {} }; },
      jsxs(type, props) { return { type, props: props || {} }; },
      Fragment: Symbol("Fragment"),
    };
  }
  if (name === "@deepseek-ai/dsh-client-ui-primitives") {
    return { MenuItemButton, IconCopyOutlineRegular, IconTrashOutlineRegular };
  }
  throw new Error(`unexpected require ${name}`);
});
const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};
const cleanups = [];
const batchDeleteCalls = [];
const batchUnarchiveCalls = [];
const startSessionCalls = [];
const clearMainCalls = [];
const ctx = {
  slots: {
    inject(slot, factory) {
      if (slot !== "sidebar.workspaces.session.menu.item") {
        const result = factory();
        if (result && typeof result.next === "function") {
          let step = result.next();
          while (!step.done) step = result.next();
        }
        return () => {};
      }
      const gen = factory();
      let step = gen.next();
      while (!step.done) {
        slotRegistrations.push(step.value);
        step = gen.next();
      }
      const dispose = () => { slotRegistrations.length = 0; };
      cleanups.push(dispose);
      return dispose;
    },
    register(options, component) {
      return { options, component };
    },
  },
  effect(fn) {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  },
  connection: {
    rpc: {
      call(_channel, method, payload) {
        if (method === "prefs") return Promise.resolve({ ok: true, value: { showCopySessionId: true, deleteSessionActions: true } });
        if (method === "deleteSession") {
          batchDeleteCalls.push(payload?.sessionId || "");
          return Promise.resolve({ ok: true, value: { sessionId: payload?.sessionId, deleted: true } });
        }
        return Promise.resolve({ ok: true, value: {} });
      },
    },
  },
  uiWorkspace: {
    mainReference: { sessionId: "session-active-current" },
    workspaces: {
      list: {
        getSnapshot() {
          return {
            items: [
              { workspaceId: "ws-copy", sessionIds: ["session-copy-test"] },
              { workspaceId: "ws-active", sessionIds: ["session-active-current"] },
              { workspaceId: "ws-copy-active", sessionIds: ["session-copy-test-active"] },
            ],
          };
        },
      },
    },
    async unarchiveSession(id) { batchUnarchiveCalls.push(id); },
    async startSession(workspaceId) { startSessionCalls.push(workspaceId); },
    clearMain() { clearMainCalls.push(true); this.mainReference = undefined; },
  },
  remote: null,
};
client.apply(ctx);
await Promise.resolve();


assert.equal(slotRegistrations.length, 2, "session menu must register copy + delete slots");
assert.deepEqual(
  slotRegistrations.map((entry) => ({
    id: entry.options.id,
    order: entry.options.order,
    name: entry.options.name,
  })),
  [
    { id: "deepseek-harness-desktop.copy-session-id", order: 500, name: "sidebar.workspaces.session.menu.item" },
    { id: "deepseek-harness-desktop.delete-session", order: 600, name: "sidebar.workspaces.session.menu.item" },
  ],
  "copy/delete must follow official pin/rename/fork/archive orders",
);

reactStates.length = 0;
const copyNode = slotRegistrations[0].component({
  sessionId: "session-copy-test",
  useMenuOpenState: () => [true, () => {}],
});
assert.equal(copyNode.type, MenuItemButton);
assert.equal(copyNode.props.separatorBefore, true);
assert.ok(copyNode.props.icon, "copy item must render an icon");

clipboardValue = "";
await copyNode.props.onSelect();
await flushMicrotasks();
assert.equal(clipboardValue, "session-copy-test", "clipboard must receive the session id");

clipboardRejects = true;
let execCommandCalled = false;
sandbox.document.execCommand = (cmd) => {
  if (cmd === "copy") {
    execCommandCalled = true;
    return true;
  }
  return false;
};
await copyNode.props.onSelect();
await flushMicrotasks();
assert.equal(execCommandCalled, true, "execCommand fallback must run when clipboard rejects");
delete sandbox.document.execCommand;
clipboardRejects = false;

window.__DSH_DESKTOP_SHOW_COPY_SESSION_ID__ = false;
window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: false });
reactStates.length = 0;
assert.equal(
  slotRegistrations[0].component({
    sessionId: "session-copy-test",
    useMenuOpenState: () => [true, () => {}],
  }),
  null,
  "disabled copy preference must hide the item",
);
window.__DSH_DESKTOP_SHOW_COPY_SESSION_ID__ = true;
window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: true });

reactStates.length = 0;
let menuOpen = true;
const deleteNode = slotRegistrations[1].component({
  sessionId: "session-copy-test",
  useMenuOpenState: () => [menuOpen, (value) => { menuOpen = value; }],
});
assert.equal(deleteNode.type, MenuItemButton);
assert.equal(deleteNode.props.danger, true);
deleteNode.props.onSelect();
await flushMicrotasks();
assert.equal(menuOpen, false, "delete should close the overflow menu");
const activeConfirm = document.querySelector("[data-dsh-delete-session-confirm]");
assert.ok(activeConfirm, "delete click must open a confirmation dialog");
activeConfirm.querySelector("[data-dsh-delete-session-confirm-submit]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.equal(batchDeleteCalls.includes("session-copy-test"), true, "confirmed delete must call host deleteSession");
assert.equal(startSessionCalls.length, 0, "deleting an inactive session must not start a new session");
assert.equal(clearMainCalls.length, 0, "deleting an inactive session must not clear main view");

window.__DSH_DESKTOP_DELETE_SESSION_ACTIONS__ = false;
window.dispatchEvent({ type: "dsh-desktop-delete-session-actions", detail: false });
reactStates.length = 0;
assert.equal(
  slotRegistrations[1].component({
    sessionId: "session-copy-test",
    useMenuOpenState: () => [true, () => {}],
  }),
  null,
  "disabled delete preference must hide the item",
);
window.__DSH_DESKTOP_DELETE_SESSION_ACTIONS__ = true;
window.dispatchEvent({ type: "dsh-desktop-delete-session-actions", detail: true });


const makeArchivedRow = (id, label = id) => {
  const row = document.createElement("li");
  const fiber = { key: id, memoizedProps: {}, return: null };
  Object.defineProperty(row, "__reactFiber$" + id, { value: fiber });
  const unarchive = document.createElement("button");
  unarchive.setAttribute("aria-label", "Unarchive " + label);
  unarchive.textContent = "Unarchive";
  row.appendChild(unarchive);
  return row;
};
const archivedList = document.createElement("ul");
const archivedRow = makeArchivedRow("session-archived-test", "Archived test");
archivedList.appendChild(archivedRow);
document.documentElement.appendChild(archivedList);
assert.ok(archivedRow.querySelector("[data-dsh-delete-archived-session]"), "archived row delete item was not injected");
assert.equal(archivedRow.querySelector("[data-dsh-delete-archived-session]").getAttribute("data-dsh-delete-archived-id"), "session-archived-test");
archivedRow.querySelector("[data-dsh-delete-archived-session]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
const archivedConfirm = document.querySelector("[data-dsh-delete-session-confirm]");
assert.ok(archivedConfirm, "archived delete click must open a confirmation dialog");
archivedConfirm.querySelector("[data-dsh-delete-session-confirm-submit]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.equal(archivedRow.parentElement, null, "confirmed archived deletion must remove the row");

const makeArchivedList = (ids) => {
  const list = document.createElement("ul");
  for (const id of ids) list.appendChild(makeArchivedRow(id));
  document.documentElement.appendChild(list);
  return list;
};
const unarchiveList = makeArchivedList(["session-batch-unarchive-1", "session-batch-unarchive-2"]);
await flushMicrotasks();
const batchToolbar = document.querySelector("[data-dsh-archived-batch]");
assert.ok(batchToolbar, "archived batch toolbar was not injected");
const batchRows = unarchiveList.querySelectorAll("[data-dsh-archived-session-select]");
assert.equal(batchRows.length, 2, "each archived row must receive a selection checkbox");
const selectAll = batchToolbar.querySelector("[data-dsh-archived-batch-select-all]");
selectAll.checked = true;
selectAll.dispatchEvent({ type: "change" });
assert.equal(batchToolbar.querySelector("[data-dsh-archived-batch-count]").textContent.includes("2"), true, "select-all must select every visible archived row");
selectAll.checked = false;
selectAll.dispatchEvent({ type: "change" });
assert.equal(batchToolbar.querySelector("[data-dsh-archived-batch-count]").textContent.includes("0"), true, "select-all off must clear visible selections");
selectAll.checked = true;
selectAll.dispatchEvent({ type: "change" });
batchToolbar.querySelector("[data-dsh-archived-batch-unarchive]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
const batchUnarchiveConfirm = document.querySelector("[data-dsh-delete-session-confirm]");
assert.ok(batchUnarchiveConfirm, "batch unarchive must ask for confirmation");
batchUnarchiveConfirm.querySelector("[data-dsh-delete-session-confirm-submit]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.deepEqual(batchUnarchiveCalls, ["session-batch-unarchive-1", "session-batch-unarchive-2"], "batch unarchive must execute in list order");
assert.equal(unarchiveList.querySelectorAll("li").length, 0, "successful batch unarchive must remove processed rows");
document.querySelector("[data-dsh-archived-batch-progress-close]")?.dispatchEvent({ type: "click" });

batchDeleteCalls.length = 0;
const deleteList = makeArchivedList(["session-batch-delete-1", "session-batch-delete-2"]);
await flushMicrotasks();
const deleteToolbar = document.querySelector("[data-dsh-archived-batch]");
const deleteRows = deleteList.querySelectorAll("[data-dsh-archived-session-select]");
for (const checkbox of deleteRows) {
  checkbox.checked = true;
  checkbox.dispatchEvent({ type: "change" });
}
deleteToolbar.querySelector("[data-dsh-archived-batch-delete]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
const batchDeleteConfirm = document.querySelector("[data-dsh-delete-session-confirm]");
assert.ok(batchDeleteConfirm, "batch delete must ask for confirmation");
batchDeleteConfirm.querySelector("[data-dsh-delete-session-confirm-submit]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.deepEqual(batchDeleteCalls, ["session-batch-delete-1", "session-batch-delete-2"], "batch delete must execute in list order");
assert.equal(deleteList.querySelectorAll("li").length, 0, "successful batch delete must remove processed rows");

// Real browsers deliver MutationObserver callbacks asynchronously. Re-run the
// archived decoration under that delivery model so an identical text assignment
// cannot hide an infinite observer loop behind the synchronous fixture shim.
asyncMutationDelivery = true;
mutationDeliveryScheduled = false;
mutationDeliveryCount = 0;
mutationDeliveryLimit = 40;
mutationDeliveryError = null;
const stableList = makeArchivedList(["session-batch-observer-stability"]);
for (let i = 0; i < 64; i += 1) await Promise.resolve();
assert.equal(mutationDeliveryError, null, "archived decoration must settle under async MutationObserver delivery");
assert.ok(mutationDeliveryCount < mutationDeliveryLimit, "archived decoration must not continuously schedule MutationObserver work");
assert.equal(stableList.querySelectorAll("[data-dsh-archived-session-select]").length, 1, "observer stability fixture must remain decorated");
asyncMutationDelivery = false;
stableList.remove();

// First-class Archived Sessions page owns its batch/select UI. With only that page
// mounted (no foreign Unarchive list), decoration must leave its controls alone.
const firstClassPage = document.createElement("div");
firstClassPage.setAttribute("data-dsh-archived-sessions-page", "");
const firstClassToolbar = document.createElement("div");
firstClassToolbar.setAttribute("data-dsh-archived-batch", "");
const firstClassSelectAll = document.createElement("input");
firstClassSelectAll.type = "checkbox";
firstClassSelectAll.setAttribute("data-dsh-archived-batch-select-all", "");
firstClassToolbar.appendChild(firstClassSelectAll);
firstClassPage.appendChild(firstClassToolbar);
const firstClassList = document.createElement("ul");
const firstClassRow = makeArchivedRow("session-first-class-owned", "First class");
const firstClassCheckbox = document.createElement("input");
firstClassCheckbox.type = "checkbox";
firstClassCheckbox.setAttribute("data-dsh-archived-session-select", "");
firstClassCheckbox.setAttribute("data-dsh-archived-session-select-id", "session-first-class-owned");
if (firstClassRow.childNodes[0]) firstClassRow.childNodes[0].before(firstClassCheckbox);
else firstClassRow.appendChild(firstClassCheckbox);
const firstClassDelete = document.createElement("button");
firstClassDelete.setAttribute("data-dsh-delete-archived-session", "");
firstClassDelete.setAttribute("data-dsh-delete-archived-id", "session-first-class-owned");
firstClassDelete.textContent = "Delete session";
firstClassRow.appendChild(firstClassDelete);
firstClassList.appendChild(firstClassRow);
firstClassPage.appendChild(firstClassList);
document.documentElement.appendChild(firstClassPage);
await flushMicrotasks();
assert.ok(firstClassPage.querySelector("[data-dsh-archived-batch]"), "first-class batch toolbar must survive decoration when no legacy list exists");
assert.ok(firstClassPage.querySelector("[data-dsh-archived-session-select]"), "first-class row checkbox must survive decoration");
assert.ok(firstClassPage.querySelector("[data-dsh-delete-archived-session]"), "first-class delete must survive decoration");
assert.equal(
  [...document.querySelectorAll("[data-dsh-archived-batch]")].filter((el) => !el.closest("[data-dsh-archived-sessions-page]")).length,
  0,
  "decorator must not inject a legacy toolbar for the first-class page"
);
firstClassPage.remove();

for (const cleanup of cleanups) cleanup();
assert.equal(slotRegistrations.length, 0, "dispose must drop session menu slot registrations");
console.log("ok - session menu slots register copy/delete after archive, gate on prefs, and clean up");
