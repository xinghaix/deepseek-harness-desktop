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
      ? attrExpression.slice(equals + 1).trim().replace(/^["']/, "").replace(/["']$/, "")
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
    this.tagName = String(tagName || "div").toUpperCase();
    this.attributes = new Map();
    this.childNodes = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this._textContent = "";
    this.checked = false;
    this.disabled = false;
    this.indeterminate = false;
  }
  get className() { return this.getAttribute("class") || ""; }
  set className(value) { this.setAttribute("class", value); }
  get children() { return this.childNodes; }
  get isConnected() {
    let current = this;
    while (current.parentElement) current = current.parentElement;
    return current === document.documentElement || current === document.body || current === document.head;
  }
  get textContent() {
    return this._textContent || this.childNodes.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    this._textContent = String(value ?? "");
    this.childNodes = [];
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) {
    if (child.parentElement) child.remove();
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.childNodes;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }
  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (selectorMatches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (selectorMatches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) || []) listener(event);
  }
  focus() {}
  cloneNode() { return new FakeElement(this.tagName); }
}

const document = {
  documentElement: new FakeElement("html"),
  body: new FakeElement("body"),
  head: new FakeElement("head"),
  createElement(tag) { return new FakeElement(tag); },
  createElementNS(_ns, tag) { return new FakeElement(tag); },
  querySelector(selector) { return document.documentElement.querySelector(selector) || document.body.querySelector(selector); },
  querySelectorAll(selector) {
    return [
      ...document.documentElement.querySelectorAll(selector),
      ...document.body.querySelectorAll(selector),
    ];
  },
  addEventListener(name, fn) {
    if (!documentListeners.has(name)) documentListeners.set(name, new Set());
    documentListeners.get(name).add(fn);
  },
  removeEventListener(name, fn) { documentListeners.get(name)?.delete(fn); },
};
document.documentElement.appendChild(document.head);
document.documentElement.appendChild(document.body);

const window = {
  addEventListener(name, fn) {
    if (!windowListeners.has(name)) windowListeners.set(name, new Set());
    windowListeners.get(name).add(fn);
  },
  removeEventListener(name, fn) { windowListeners.get(name)?.delete(fn); },
  dispatchEvent(event) {
    for (const listener of windowListeners.get(event.type) || []) listener(event);
  },
  setTimeout: scheduleTimer,
  clearTimeout: cancelTimer,
  __ModuleLoader__: {
    load(value) { window.__registration = value; },
  },
};

class MutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
}

const sandbox = {
  window,
  document,
  MutationObserver,
  navigator: { clipboard: { writeText: async () => {} } },
  queueMicrotask: (fn) => fn(),
  setTimeout: scheduleTimer,
  clearTimeout: cancelTimer,
  console,
  Date,
  Math,
  Object,
  Map,
  Set,
  Promise,
  Error,
  JSON,
  String,
  Number,
  Array,
  Symbol,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "archived-sessions-section.js" });
const registration = window.__registration;
assert.ok(registration, "client registration missing");

// Minimal React that materializes a virtual tree we can assert on.
function createElement(type, props, ...children) {
  if (typeof type === "function") {
    return type({ ...(props || {}), children: children.flat().filter((c) => c != null && c !== false) });
  }
  const node = {
    type,
    props: props || {},
    children: children.flat().filter((c) => c != null && c !== false),
  };
  return node;
}
const hooks = {
  states: [],
  index: 0,
  effects: [],
};
const react = {
  useState(initial) {
    const i = hooks.index++;
    if (hooks.states[i] === undefined) {
      hooks.states[i] = typeof initial === "function" ? initial() : initial;
    }
    const set = (value) => {
      hooks.states[i] = typeof value === "function" ? value(hooks.states[i]) : value;
    };
    return [hooks.states[i], set];
  },
  useMemo(factory) { return factory(); },
  useEffect(fn) { hooks.effects.push(fn); },
  useCallback(fn) { return fn; },
  useRef(initial) { return { current: initial }; },
};
const jsxRuntime = {
  jsx(type, props) { return createElement(type, props); },
  jsxs(type, props) {
    const { children, ...rest } = props || {};
    const list = Array.isArray(children) ? children : (children == null ? [] : [children]);
    return createElement(type, rest, ...list);
  },
  Fragment: Symbol("Fragment"),
};

const client = registration.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return jsxRuntime;
  throw new Error(`unexpected require ${name}`);
});

const sectionRegistrations = [];
const localeRegisters = [];
const effects = [];
const unarchiveCalls = [];
const deleteCalls = [];

const sessionsState = {
  phase: "ready",
  byId: {
    "session-archived-a": { displayTitle: "Alpha archived", updatedAt: Date.now() - 120000 },
    "session-archived-b": { displayTitle: "Beta archived", updatedAt: Date.now() - 3600000 },
  },
};
const workspacesState = {
  items: [
    { title: "Demo workspace", sessionIds: ["session-archived-a"] },
  ],
  archivedSessionIds: ["session-archived-b", "session-archived-a"],
};

const ctx = {
  slots: {
    inject(_name, factory) {
      const entry = factory();
      return () => {};
    },
    register(options, component) {
      sectionRegistrations.push({ options, component });
      return () => {};
    },
  },
  effect(fn, label) {
    effects.push(label || "");
    const cleanup = fn();
    return typeof cleanup === "function" ? cleanup : undefined;
  },
  locale: {
    register(ns, dicts) {
      localeRegisters.push({ ns, dicts });
      return () => {};
    },
    bind(ns) {
      const dict = localeRegisters.find((entry) => entry.ns === ns)?.dicts?.zh || {};
      return (key, vars) => {
        let text = dict[key] || key;
        if (vars && typeof vars === "object") {
          for (const [name, value] of Object.entries(vars)) {
            text = String(text).split("{" + name + "}").join(value == null ? "" : String(value));
          }
        }
        return text;
      };
    },
  },
  connection: {
    rpc: {
      call(_channel, method, payload) {
        if (method === "prefs") {
          return Promise.resolve({ ok: true, value: { deleteSessionActions: true } });
        }
        if (method === "deleteSession") {
          deleteCalls.push(payload?.sessionId || "");
          return Promise.resolve({ ok: true, value: { sessionId: payload?.sessionId, deleted: true } });
        }
        if (method === "localeBundle") {
          return Promise.resolve({ ok: true, value: { locale: "zh-CN", catalog: {} } });
        }
        return Promise.resolve({ ok: true, value: {} });
      },
    },
  },
  uiWorkspace: {
    mainReference: undefined,
    async unarchiveSession(id) { unarchiveCalls.push(id); },
    async startSession() {},
    clearMain() {},
  },
  remote: null,
  sessions: null,
  workspaces: null,
  layout: null,
};

client.apply(ctx);
await Promise.resolve();

const archived = sectionRegistrations.find((entry) => entry.options?.id === "archived-sessions");
assert.ok(archived, "archived-sessions settings.section must be registered");
assert.equal(archived.options.order, 25);
assert.equal(archived.options.locale, "settings.archivedSessions");
assert.equal(archived.options.label(), "已归档会话");
assert.ok(localeRegisters.some((entry) => entry.ns === "settings.archivedSessions"), "locale dictionaries registered");

const desktop = sectionRegistrations.find((entry) => entry.options?.id === "deepseek-harness-desktop");
assert.ok(desktop, "desktop settings section must still be registered");

const injected = archived.options.inject();
assert.equal(typeof injected.unarchive, "function");
assert.equal(typeof injected.deleteSession, "function");

hooks.states = [];
hooks.index = 0;
hooks.effects = [];
const tree = archived.component({
  t: ctx.locale.bind("settings.archivedSessions"),
  useSessions: (selector) => selector(sessionsState),
  useWorkspaces: (selector) => selector(workspacesState),
  unarchive: injected.unarchive,
  deleteSession: injected.deleteSession,
});

function collect(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.type) out.push(node);
  const fromArgs = Array.isArray(node.children) && node.children.length > 0 ? node.children : null;
  const fromProps = node.props ? node.props.children : null;
  const kids = fromArgs || fromProps;
  if (Array.isArray(kids)) for (const child of kids) collect(child, out);
  else if (kids) collect(kids, out);
  return out;
}
const nodes = collect(tree);
assert.ok(nodes.some((node) => node.props && Object.prototype.hasOwnProperty.call(node.props, "data-dsh-archived-sessions-page")), "page root must carry data-dsh-archived-sessions-page");
assert.ok(nodes.some((node) => node.props && Object.prototype.hasOwnProperty.call(node.props, "data-dsh-archived-batch")), "batch toolbar is first-class on the page");
assert.ok(nodes.some((node) => node.type === "input" && node.props?.type === "search"), "search box present");
const rows = nodes.filter((node) => node.type === "li");
assert.equal(rows.length, 2, "two archived summaries become rows");
assert.equal(rows[0].props["data-session-id"], "session-archived-a", "newest archive first");
assert.equal(rows[1].props["data-session-id"], "session-archived-b");
assert.ok(nodes.some((node) => node.type === "button" && String(node.props?.["aria-label"] || "").includes("取消归档")), "per-row unarchive present");
assert.ok(nodes.some((node) => node.props && Object.prototype.hasOwnProperty.call(node.props, "data-dsh-delete-archived-session")), "per-row delete present");
assert.ok(nodes.some((node) => node.props && Object.prototype.hasOwnProperty.call(node.props, "data-dsh-archived-session-select")), "row multi-select present");

await injected.unarchive("session-archived-a");
assert.deepEqual(unarchiveCalls, ["session-archived-a"]);
await injected.deleteSession("session-archived-b");
assert.deepEqual(deleteCalls, ["session-archived-b"]);

console.log("archived_sessions_section_test: ok");
