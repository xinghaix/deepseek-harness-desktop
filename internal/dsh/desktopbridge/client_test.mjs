import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
let registration;
const listeners = new Map();
const timers = [];
const scheduleTimer = (fn, delay) => {
  const timer = { fn, delay, cancelled: false };
  timers.push(timer);
  return timer;
};
const cancelTimer = (timer) => {
  if (timer) timer.cancelled = true;
};
const window = {
  addEventListener(name, fn) {
    listeners.set(name, fn);
  },
  removeEventListener(name, fn) {
    if (listeners.get(name) === fn) listeners.delete(name);
  },
  __ModuleLoader__: {
    load(value) {
      registration = value;
    },
  },
};
const document = {
  head: { appendChild() {} },
  documentElement: {},
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  createElement() {
    return { dataset: {}, style: {} };
  },
};

vm.runInNewContext(
  source,
  {
    window,
    document,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout: scheduleTimer,
    clearTimeout: cancelTimer,
    console,
  },
  { filename: "desktop-bridge-client.js" },
);
assert.ok(registration, "client registration missing");

const react = {
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
};
const client = registration.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx() {}, jsxs() {}, Fragment: Symbol("Fragment") };
  throw new Error(`unexpected require ${name}`);
});
const flushMicrotasks = async () => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

let snapshot = { byId: {}, ids: [], current: undefined };
let listListener = () => {};
const opened = [];
let claimResult = "";
let claimCalls = 0;
const ctx = {
  slots: { inject() {} },
  effect(fn) {
    fn();
  },
  get(name) {
    return name === "uiWorkspace" ? this.uiWorkspace : undefined;
  },
  remote: null,
  connection: {
    rpc: {
      call(_channel, method) {
        if (method === "claimOpenSession") {
          claimCalls += 1;
          return Promise.resolve({ ok: true, value: { sessionId: claimResult } });
        }
        return Promise.resolve({ ok: true, value: {} });
      },
    },
  },
  sessions: {
    list: {
      getSnapshot: () => snapshot,
      subscribe(fn) {
        listListener = fn;
        return () => {};
      },
    },
    open(id) {
      if (!snapshot.byId[id]) throw new Error(`unknown session ${id}`);
      snapshot.current = id;
      opened.push(id);
    },
  },
  uiWorkspace: {
    openSession(id) {
      if (!snapshot.byId[id]) throw new Error(`unknown session ${id}`);
      snapshot.current = id;
      opened.push(id);
    },
  },
};

client.apply(ctx);
const handler = listeners.get("dsh-desktop-open-session");
assert.ok(handler, "open-session listener missing");

// The tray event can arrive before the asynchronous Session-list baseline.
handler({ detail: "session-late" });
await flushMicrotasks();
snapshot = {
  byId: { "session-late": { id: "session-late", running: false } },
  ids: ["session-late"],
  current: undefined,
};
listListener();
await flushMicrotasks();

assert.deepEqual(
  opened,
  ["session-late"],
  "a tray click must be retried when the session list becomes ready",
);

// The official workspace API is required; absence must remain retryable rather
// than silently bypassing layout.selectPanel(null) via sessions.open().
const officialWorkspace = ctx.uiWorkspace;
ctx.uiWorkspace = null;
snapshot = {
  byId: {
    "session-late": { id: "session-late", running: false },
    "session-workspace": { id: "session-workspace", running: false },
  },
  ids: ["session-late", "session-workspace"],
  current: "session-late",
};
handler({ detail: "session-workspace" });
await flushMicrotasks();
assert.deepEqual(opened, ["session-late"], "must not bypass the official workspace navigation API");
ctx.uiWorkspace = officialWorkspace;
listListener();
await flushMicrotasks();
assert.deepEqual(opened, ["session-late", "session-workspace"], "workspace navigation must retry when the service becomes ready");

// The WebView event can also be missed after apply() has already completed.
// A later claim must still reach the navigation queue without another page load.
claimResult = "session-poll";
snapshot = {
  byId: {
    "session-late": { id: "session-late", running: false },
    "session-poll": { id: "session-poll", running: false },
  },
  ids: ["session-late", "session-poll"],
  current: "session-late",
};
const timerIndex = timers.findIndex((timer) => !timer.cancelled);
assert.notEqual(timerIndex, -1, "claim retry timer missing");
const timer = timers.splice(timerIndex, 1)[0];
await timer.fn();
await flushMicrotasks();
assert.ok(claimCalls >= 3, "client must retry claiming pending tray sessions");
assert.deepEqual(
  opened,
  ["session-late", "session-workspace", "session-poll"],
  "a pending tray session must open even when the WebView event was missed",
);

// If polling wins the race, the delayed event for the same request must not
// navigate twice; a later independent click remains allowed.
claimResult = "";
handler({ detail: "session-poll" });
await flushMicrotasks();
assert.deepEqual(opened, ["session-late", "session-workspace", "session-poll"], "duplicate tray event must be suppressed");

const backoffDelays = [];
for (let i = 0; i < 7; i += 1) {
  const nextIndex = timers.findIndex((entry) => !entry.cancelled);
  assert.notEqual(nextIndex, -1, "claim poll timer missing during backoff");
  const next = timers.splice(nextIndex, 1)[0];
  backoffDelays.push(next.delay);
  await next.fn();
  await flushMicrotasks();
}
assert.deepEqual(
  backoffDelays,
  [500, 1000, 2000, 4000, 8000, 10000, 10000],
  "idle claim polling must back off and cap its interval",
);
console.log("ok - tray click survives early lists, missed events, duplicates, and idle backoff");
