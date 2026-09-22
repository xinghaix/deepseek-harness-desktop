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

const react = {};
const client = registration.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx() {}, jsxs() {}, Fragment: Symbol("Fragment") };
  throw new Error(`unexpected require ${name}`);
});
const flushMicrotasks = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};
const cleanups = [];
const batchDeleteCalls = [];
const batchUnarchiveCalls = [];
const ctx = {
  slots: { inject() {} },
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
    async unarchiveSession(id) { batchUnarchiveCalls.push(id); },
  },
  remote: null,
};
client.apply(ctx);
await Promise.resolve();

const sessionFiber = {
  memoizedProps: {
    node: { id: "session-copy-test" },
    onRename() {},
    onFork() {},
    onArchive() {},
  },
  return: null,
};
const row = document.createElement("div");
row.setAttribute("role", "treeitem");
const action = document.createElement("button");
Object.defineProperty(action, "__reactFiber$test", { value: { return: sessionFiber } });
row.appendChild(action);
document.documentElement.appendChild(row);
documentListeners.get("pointerdown")({ target: action });

const makeOfficialItem = (label) => {
  const wrapper = document.createElement("div");
  wrapper.className = "itemWrap";
  const item = document.createElement("button");
  item.setAttribute("type", "button");
  item.setAttribute("role", "menuitem");
  const icon = document.createElement("span");
  icon.appendChild(document.createElement("svg"));
  const text = document.createElement("span");
  text.textContent = label;
  item.appendChild(icon);
  item.appendChild(text);
  wrapper.appendChild(item);
  return wrapper;
};
const menu = document.createElement("div");
menu.setAttribute("role", "menu");
const viewport = document.createElement("div");
viewport.setAttribute("role", "presentation");
for (const label of ["重命名", "分叉会话", "归档会话"]) viewport.appendChild(makeOfficialItem(label));
menu.appendChild(viewport);
Object.defineProperty(menu, "__reactFiber$menu", { value: { return: sessionFiber } });
document.documentElement.appendChild(menu);

const copyItem = () => menu.querySelector("[data-dsh-copy-session-id]");
assert.ok(copyItem(), "session menu item was not injected");
assert.deepEqual(
  menu.querySelectorAll("button[role='menuitem']").map((item) => item.textContent),
  ["重命名", "分叉会话", "复制会话ID", "归档会话", "删除会话"],
  "session menu order must end with delete",
);
assert.equal(copyItem().parentElement.parentElement, viewport, "copy item must have its own sibling wrapper");
assert.ok(copyItem().querySelector("svg"), "copy item must retain a visible icon");
assert.equal(copyItem().querySelector("svg").getAttribute("viewBox"), "0 0 16 16");
assert.equal(copyItem().querySelector("svg").getAttribute("width"), "16");
assert.equal(copyItem().querySelector("svg").getAttribute("height"), "16");
assert.equal(copyItem().querySelectorAll("path").length, 1, "official copy icon path missing");
assert.equal(copyItem().querySelector("path").getAttribute("fill"), "currentColor");
assert.equal(copyItem().getAttribute("data-dsh-copy-session-id-value"), "session-copy-test");
const deleteItem = () => menu.querySelector("[data-dsh-delete-session]");
assert.ok(deleteItem(), "delete session item was not injected");
assert.equal(deleteItem().textContent, "删除会话");
assert.equal(deleteItem().getAttribute("data-dsh-delete-session-value"), "session-copy-test");
assert.equal(deleteItem().parentElement.parentElement, viewport, "delete item must have its own sibling wrapper");
assert.ok(deleteItem().querySelector("svg"), "delete item must retain a visible icon");
assert.equal(deleteItem().querySelector("svg").getAttribute("viewBox"), "0 0 16 16");
assert.equal(deleteItem().querySelector("svg").getAttribute("width"), "16");
assert.equal(deleteItem().querySelector("svg").getAttribute("height"), "16");
assert.equal(deleteItem().querySelectorAll("path").length, 1, "official trash icon path missing");
assert.equal(deleteItem().querySelector("path").getAttribute("fill"), "currentColor");

let clipboardValue = "";
let clipboardRejects = false;
const clipboard = {
  writeText(value) {
    if (clipboardRejects) return Promise.reject(new Error("clipboard denied"));
    clipboardValue = value;
    return Promise.resolve();
  },
};
sandbox.navigator.clipboard = clipboard;
copyItem().dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.equal(clipboardValue, "session-copy-test", "clipboard must receive the owning session id");
assert.equal(copyItem().querySelector("[data-dsh-copy-session-id-label]").textContent, "已复制");

clipboardRejects = true;
copyItem().dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.equal(copyItem().querySelector("[data-dsh-copy-session-id-label]").textContent, "复制失败");

window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: false });
assert.equal(copyItem(), null, "disabled preference must remove the injected item");
window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: true });
assert.ok(copyItem(), "re-enabled preference must restore the injected item");
window.dispatchEvent({ type: "dsh-desktop-delete-session-actions", detail: false });
assert.equal(deleteItem(), null, "disabled delete preference must remove the injected item");
window.dispatchEvent({ type: "dsh-desktop-delete-session-actions", detail: true });
assert.ok(deleteItem(), "re-enabled delete preference must restore the injected item");
deleteItem().dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
const activeConfirm = document.querySelector("[data-dsh-delete-session-confirm]");
assert.ok(activeConfirm, "delete click must open a confirmation dialog");
activeConfirm.querySelector("[data-dsh-delete-session-confirm-submit]").dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
await flushMicrotasks();
assert.equal(deleteItem(), null, "confirmed active deletion must remove the menu item");

const workspaceMenu = document.createElement("div");
workspaceMenu.setAttribute("role", "menu");
const workspaceViewport = document.createElement("div");
workspaceViewport.setAttribute("role", "presentation");
for (const label of ["重命名", "删除工作区"]) workspaceViewport.appendChild(makeOfficialItem(label));
workspaceMenu.appendChild(workspaceViewport);
document.documentElement.appendChild(workspaceMenu);
assert.equal(workspaceMenu.querySelector("[data-dsh-copy-session-id]"), null, "workspace menus must remain untouched");

const noFiberMenu = document.createElement("div");
noFiberMenu.setAttribute("role", "menu");
const noFiberViewport = document.createElement("div");
noFiberViewport.setAttribute("role", "presentation");
for (const label of ["重命名", "分叉会话", "归档会话"]) noFiberViewport.appendChild(makeOfficialItem(label));
noFiberMenu.appendChild(noFiberViewport);
document.documentElement.appendChild(noFiberMenu);
assert.equal(noFiberMenu.querySelector("[data-dsh-copy-session-id]"), null, "missing React fiber must fail closed");

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

for (const cleanup of cleanups) cleanup();
assert.equal(menu.querySelector("[data-dsh-copy-session-id]"), null, "dispose must remove injected menu nodes");
assert.equal(menu.querySelector("[data-dsh-delete-session]"), null, "dispose must remove delete menu nodes");
window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: true });
assert.equal(menu.querySelector("[data-dsh-copy-session-id]"), null, "dispose must remove setting listeners");
console.log("ok - plugin-only session menu adapter injects, gates, copies, fails closed, and cleans up");
