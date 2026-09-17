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
assert.match(source, /CAPABILITIES_SCHEMA/, "capability schema marker missing");
assert.match(source, /ensureDesktopHandshake/, "initial capability handshake missing");
assert.match(source, /http-fallback/, "HTTP fallback mode missing");
assert.match(source, /能力不兼容，已回退 HTTP 并关闭增强功能/, "incompatible handshake prompt missing");
assert.match(source, /enhancementDisabled/, "enhancement gate missing");
assert.match(source, /__DSH_DESKTOP_TRANSPORT__/, "negotiated transport state missing");
assert.match(source, /installCopySessionIdMenu/, "copy-session menu installer missing");
assert.match(source, /sessionIdFromReactFiber/, "session-id fiber adapter missing");
assert.match(source, /archive\.parentElement\.before\(wrapper\)/, "copy item must be a sibling menu wrapper");
assert.match(source, /navigator\.clipboard\.writeText/, "copy item must use the browser clipboard API");
assert.match(source, /复制会话ID/, "Chinese copy-session label missing");
assert.match(source, /复制失败/, "clipboard failure feedback missing");
assert.match(source, /PENDING_SESSION_ID_TTL_MS/, "pending session id compatibility window missing");
assert.match(source, /removeCopySessionIdMenuItem/, "menu cleanup helper missing");
assert.doesNotMatch(source, /dsh-client-ui-workspace[\\/]lib/, "desktop bridge must not patch the official workspace bundle");

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

let snapshot = {
  byId: { "session-queued": { id: "session-queued", running: false } },
  ids: ["session-queued"],
  current: undefined,
};
let listListener = () => {};
let workspaceListener = () => {};
const workspaceSnapshot = { archivedSessionIds: [] };
const reportedSessions = [];
const opened = [];
let claimResult = "";
let claimCalls = 0;
const ctx = {
  slots: { inject() {} },
  effect(fn) {
    fn();
  },
  get(name) {
    if (name === "uiWorkspace") return this.uiWorkspace;
    if (name === "workspaces") return this.workspaces;
    return undefined;
  },
  remote: null,
  connection: {
    rpc: {
      call(_channel, method, payload) {
        if (method === "claimOpenSession") {
          claimCalls += 1;
          return Promise.resolve({ ok: true, value: { sessionId: claimResult } });
        }
        if (method === "reportSessions") reportedSessions.push(payload);
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
  workspaces: {
    list: {
      getSnapshot: () => workspaceSnapshot,
      subscribe(fn) {
        workspaceListener = fn;
        return () => {};
      },
    },
  },
};
window.__DSH_DESKTOP_OPEN_SESSION_PENDING__ = "session-queued";

client.apply(ctx);
assert.deepEqual(opened, ["session-queued"], "apply must drain a pending WebView request immediately");
assert.equal(window.__DSH_DESKTOP_OPEN_SESSION_PENDING__, "", "apply must consume the pending marker");
opened.length = 0;
snapshot = { byId: {}, ids: [], current: undefined };
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

// The sidebar owns archive state in the workspace controller, not in the
// SessionSummary row. Reports must preserve that bit and deduplicate IDs.
snapshot = {
  byId: {
    first: { id: "session-visible", title: "same title", running: false },
    duplicate: { id: "session-visible", title: "same title", running: false },
    archived: { id: "session-archived", title: "same title", running: false },
    subagent: { id: "session-subagent", title: "same title", running: false, origin: "subagent" },
  },
  ids: ["session-visible", "session-visible", "session-archived", "session-subagent"],
  current: "session-workspace",
};
workspaceSnapshot.archivedSessionIds = ["session-archived"];
listListener();
workspaceListener();
await flushMicrotasks();
const latestReport = reportedSessions[reportedSessions.length - 1];
assert.deepEqual(
  Array.from(latestReport.sessions, (session) => ({
    id: session.id,
    archived: Boolean(session.archived),
    origin: session.origin || "",
  })),
  [
    { id: "session-visible", archived: false, origin: "" },
    { id: "session-archived", archived: true, origin: "" },
    { id: "session-subagent", archived: false, origin: "subagent" },
  ],
  "session reports must deduplicate IDs and preserve authoritative archive state",
);

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
window.__DSH_DESKTOP_OPEN_SESSION_PENDING__ = "session-poll";
handler({ detail: "session-poll" });
assert.equal(window.__DSH_DESKTOP_OPEN_SESSION_PENDING__, "", "delivered event must consume its pending marker");
await flushMicrotasks();
assert.deepEqual(opened, ["session-late", "session-workspace", "session-poll"], "duplicate tray event must be suppressed");

// Event delivery and the immediate claim can race before list.current publishes.
// The same tray click must not invoke the official navigation API twice.
const savedOpenSession = officialWorkspace.openSession;
let holdCurrent = true;
officialWorkspace.openSession = (id) => {
  if (!snapshot.byId[id]) throw new Error(`unknown session ${id}`);
  opened.push(id);
  if (!holdCurrent) snapshot.current = id;
};
claimResult = "session-race";
snapshot = {
  byId: { "session-race": { id: "session-race", running: false } },
  ids: ["session-race"],
  current: undefined,
};
handler({ detail: "session-race" });
await flushMicrotasks();
claimResult = "";
assert.deepEqual(
  opened,
  ["session-late", "session-workspace", "session-poll", "session-race"],
  "event/claim race must not invoke navigation twice",
);
officialWorkspace.openSession = savedOpenSession;
holdCurrent = false;

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
