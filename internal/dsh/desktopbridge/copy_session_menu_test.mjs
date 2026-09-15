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
const notifyMutation = () => {
  for (const observer of [...observers]) observer.callback([]);
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
const ctx = {
  slots: { inject() {} },
  effect(fn) {
    const cleanup = fn();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  },
  connection: {
    rpc: {
      call(_channel, method) {
        if (method === "prefs") return Promise.resolve({ ok: true, value: { showCopySessionId: true } });
        return Promise.resolve({ ok: true, value: {} });
      },
    },
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
  ["重命名", "分叉会话", "复制会话ID", "归档会话"],
  "copy item order must be rename/fork/copy/archive",
);
assert.equal(copyItem().parentElement.parentElement, viewport, "copy item must have its own sibling wrapper");
assert.ok(copyItem().querySelector("svg"), "copy item must retain a visible icon");
assert.equal(copyItem().querySelector("svg").getAttribute("viewBox"), "0 0 16 16");
assert.equal(copyItem().querySelector("svg").getAttribute("width"), "16");
assert.equal(copyItem().querySelector("svg").getAttribute("height"), "16");
assert.equal(copyItem().querySelectorAll("path").length, 1, "official copy icon path missing");
assert.equal(copyItem().querySelector("path").getAttribute("fill"), "currentColor");
assert.equal(copyItem().getAttribute("data-dsh-copy-session-id-value"), "session-copy-test");

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

for (const cleanup of cleanups) cleanup();
assert.equal(menu.querySelector("[data-dsh-copy-session-id]"), null, "dispose must remove injected menu nodes");
window.dispatchEvent({ type: "dsh-desktop-show-copy-session-id", detail: true });
assert.equal(menu.querySelector("[data-dsh-copy-session-id]"), null, "dispose must remove setting listeners");
console.log("ok - plugin-only session menu adapter injects, gates, copies, fails closed, and cleans up");
