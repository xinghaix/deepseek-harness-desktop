import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
let clockNow = 10000;
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
    Date: { now: () => clockNow },
  },
  { filename: "desktop-bridge-client.js" },
);
assert.ok(registration, "client registration missing");
assert.match(source, /CAPABILITIES_SCHEMA/, "capability schema marker missing");
assert.match(source, /ensureDesktopHandshake/, "initial capability handshake missing");
assert.match(source, /http-fallback/, "HTTP fallback mode missing");
assert.match(source, /t\("bridge\.handshake_incompatible"\)/, "incompatible handshake prompt must resolve through the catalog");
assert.match(source, /enhancementDisabled/, "enhancement gate missing");
assert.match(source, /__DSH_DESKTOP_TRANSPORT__/, "negotiated transport state missing");
assert.match(source, /installSessionMenuSlots/, "session menu slot installer missing");
assert.match(source, /sidebar\.workspaces\.session\.menu\.item/, "session menu slot name missing");
assert.match(source, /deepseek-harness-desktop\.copy-session-id/, "copy session menu slot id missing");
assert.match(source, /navigator\.clipboard\.writeText/, "copy item must use the browser clipboard API");
assert.match(source, /复制会话ID/, "Chinese copy-session label missing");
assert.match(source, /复制失败/, "clipboard failure feedback missing");
assert.match(source, /DELETE_SESSION_MENU_ORDER/, "delete session menu order missing");
assert.match(source, /deepseek-harness-desktop\.delete-session/, "delete session menu slot id missing");
assert.match(source, /installHoverMessageActions/, "hover message-actions installer missing");
assert.match(source, /pickStickyPrompt/, "sticky prompt picker missing");
assert.match(source, /t\("bridge\.enhanced_hover_title"\)/, "sticky prompt settings label must resolve through the catalog");
assert.match(source, /setHoverMessageActions/, "hover message-actions setter missing");
assert.match(source, /installChatContentVisibility/, "chat content-visibility installer missing");
assert.match(source, /content-visibility:auto/, "chat content-visibility CSS missing");
assert.match(source, /setChatContentVisibility/, "chat content-visibility setter missing");
assert.match(source, /t\("field\.chat_content_visibility"\)/, "chat content-visibility settings label must resolve through the catalog");
assert.match(source, /setRestoreLastSession/, "setRestoreLastSession setter missing");
assert.match(source, /setRememberWindowSize/, "setRememberWindowSize setter missing");
assert.match(source, /t\("field\.restore_last_session"\)/, "restore_last_session label missing");
assert.match(source, /t\("field\.remember_window_size"\)/, "remember_window_size label missing");
assert.match(source, /installClipboardFallback/, "clipboard fallback installer missing");
assert.match(source, /__DSH_DESKTOP_COPY_TEXT__/, "native clipboard bridge action missing");
assert.match(source, /document.execCommand/, "document.execCommand fallback missing");
assert.match(source, /statusOpen/, "status card collapsible state missing");
assert.match(source, /dshDesktopBridgeStatusHeader/, "collapsible status card header missing");
assert.match(source, /dshDesktopBridgePill/, "status pill badge missing");
assert.match(source, /dshDesktopBridgeHeaderAction/, "compact status header action missing");
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
const nextClaimTimer = () => timers.findIndex((timer) => !timer.cancelled && timer.delay >= 500);

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
const warmed = [];
const selectedPanels = [];
let claimResult = "";
let claimRequestId = 0;
let claimCalls = 0;
const ctx = {
  slots: { inject() {} },
  effect(fn) {
    fn();
  },
  get(name) {
    if (name === "uiWorkspace") return this.uiWorkspace;
    if (name === "workspaces") return this.workspaces;
    if (name === "layout") return this.layout;
    return undefined;
  },
  remote: null,
  connection: {
    rpc: {
      call(_channel, method, payload) {
        if (method === "claimOpenSession") {
          claimCalls += 1;
          return Promise.resolve({ ok: true, value: { sessionId: claimResult, requestId: claimRequestId } });
        }
        if (method === "reportSessions") reportedSessions.push(payload);
        if (method === "prefs") {
          return Promise.resolve({ ok: true, value: { trayEnabled: true, traySessionLimit: 5 } });
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
    binding(id) {
      return {
        session: {
          open() {
            warmed.push(id);
            return Promise.resolve();
          },
        },
      };
    },
    open(id) {
      if (!snapshot.byId[id]) throw new Error(`unknown session ${id}`);
      snapshot.current = id;
      opened.push(id);
    },
  },
  layout: {
    selectPanel(panelId) {
      selectedPanels.push(panelId);
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
const timerIndex = nextClaimTimer();
assert.notEqual(timerIndex, -1, "claim retry timer missing");
const timer = timers.splice(timerIndex, 1)[0];
await timer.fn();
await flushMicrotasks();
assert.ok(claimCalls >= 2, "client must retry claiming pending tray sessions");
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
  const nextIndex = nextClaimTimer();
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

assert.equal(typeof window.__DSH_DESKTOP_OPEN_SESSION__, "function", "ExecJS fast path missing");
assert.match(source, /prefetchSessionHistory/, "history prefetch missing");
assert.match(source, /OPEN_SESSION_WARM_MS/, "idle history warm missing");
assert.match(source, /OPEN_SESSION_WARM_LIMIT/, "recency warm cap missing");
assert.match(source, /trayRecentSessionsEnabled/, "warm must require tray recent sessions");

const openedBeforeCurrent = opened.length;
snapshot = {
  byId: {
    "session-now": { id: "session-now", running: false, updatedAt: 9 },
    "session-other": { id: "session-other", running: false, updatedAt: 8 },
  },
  ids: ["session-now", "session-other"],
  current: "session-now",
};
selectedPanels.length = 0;
handler({ detail: "session-now" });
assert.equal(opened.length, openedBeforeCurrent, "already-current session must not re-run openSession");
assert.deepEqual(selectedPanels, [null], "already-current session must still leave Settings");

const claimsBeforeEvent = claimCalls;
handler({ detail: "session-now" });
await flushMicrotasks();
assert.equal(claimCalls, claimsBeforeEvent, "delivered event must not claim in the click turn");

const openedBeforeFn = opened.length;
window.__DSH_DESKTOP_OPEN_SESSION__("session-other");
assert.deepEqual(opened.slice(openedBeforeFn), ["session-other"], "window open function must navigate");

listListener();
const warmIndex = timers.findIndex((timer) => !timer.cancelled && timer.delay === 400);
assert.notEqual(warmIndex, -1, "tray history warm timer missing");
await timers.splice(warmIndex, 1)[0].fn();
assert.ok(warmed.includes("session-now"), "idle warm must open history of other tray sessions");

const drainWarmChunks = async () => {
  for (;;) {
    const i = timers.findIndex((timer) => !timer.cancelled && timer.delay === 0);
    if (i === -1) break;
    await timers.splice(i, 1)[0].fn();
  }
};
const byId = {};
for (let i = 0; i < 52; i += 1) {
  const id = `warm-${String(i).padStart(2, "0")}`;
  byId[id] = { id, running: i === 0, updatedAt: i };
}
byId["warm-blank"] = { id: "warm-blank", blank: true, updatedAt: 999 };
byId["warm-current"] = { id: "warm-current", running: false, updatedAt: 1000 };
snapshot = { byId, ids: Object.keys(byId), current: "warm-current" };
listListener();
const capWarmIndex = timers.findIndex((timer) => !timer.cancelled && timer.delay === 400);
assert.notEqual(capWarmIndex, -1, "recency warm timer missing");
await timers.splice(capWarmIndex, 1)[0].fn();
await drainWarmChunks();
const newlyWarmed = [...new Set(warmed.filter((id) => id.startsWith("warm-")))];
assert.equal(newlyWarmed.length, 5, "must warm traySessionLimit (default 5) most recent sessions");
assert.ok(newlyWarmed.includes("warm-51"), "newest session must be warmed");
assert.ok(newlyWarmed.includes("warm-47"), "5th-newest session must be warmed");
assert.ok(!newlyWarmed.includes("warm-46"), "6th-newest session must stay outside the default cap");
assert.ok(!newlyWarmed.includes("warm-00"), "oldest session must stay outside the cap even if running");
assert.ok(!newlyWarmed.includes("warm-current"), "current session must not be warmed");
assert.ok(!newlyWarmed.includes("warm-blank"), "blank session must not be warmed");

// A late claim is the same delivery, not a second user request. A later
// click on the SAME session with a lost WebView event must still recover.
snapshot = {
  byId: { A: { id: "A" }, B: { id: "B" } },
  ids: ["A", "B"], current: "B",
};
window.__DSH_DESKTOP_OPEN_SESSION__("A", 41);
assert.equal(snapshot.current, "A");
clockNow += 2000;
ctx.uiWorkspace.openSession("B");
claimResult = "A";
claimRequestId = 41;
await timers.splice(nextClaimTimer(), 1)[0].fn();
await flushMicrotasks();
assert.equal(snapshot.current, "B", "delayed claim must not undo later sidebar navigation");
claimRequestId = 42;
await timers.splice(nextClaimTimer(), 1)[0].fn();
await flushMicrotasks();
assert.equal(snapshot.current, "A", "new same-ID tray click must recover when its event is lost");

// An older claim can be in flight when a newer event is delivered. Neither its
// response nor a delayed event for it may override the newer request.
claimResult = "A";
claimRequestId = 44;
timers.splice(nextClaimTimer(), 1)[0].fn();
window.__DSH_DESKTOP_OPEN_SESSION__("B", 45);
await flushMicrotasks();
assert.equal(snapshot.current, "B", "old in-flight claim must not override newer event");
clockNow += 2000;
handler({ detail: "A", desktopRequestId: 44 });
assert.equal(snapshot.current, "B", "out-of-order native event must not override newer request");
window.__DSH_DESKTOP_OPEN_SESSION__("A", 46);
ctx.uiWorkspace.openSession("B");
window.__DSH_DESKTOP_OPEN_SESSION__("A", 47);
assert.equal(snapshot.current, "A", "fresh same-ID click must not be throttled by legacy time dedupe");

console.log("ok - tray navigation preserves intent across late claims and same-ID clicks");

// Load both production scripts with the real remote-page shape: NO Wails Call API.
const chromeSource = fs.readFileSync(new URL("../../desktop/chrome.go", import.meta.url), "utf8")
  .split("const desktopExternalJSTemplate = `")[1].split("\n`")[0].replace("@@USE_CUSTOM_MENU@@", "false");
document.addEventListener = () => {};
window.wails = {};
const externalCalls = [], externalAlerts = [];
window.alert = message => externalAlerts.push(message);
let externalResult = {ok: true, value: {}};
const savedRPC = ctx.connection.rpc.call;
ctx.connection.rpc.call = (channel, method, payload, signal) => {
  if (method !== "openExternalURL") return savedRPC(channel, method, payload, signal);
  externalCalls.push({channel, method, payload});
  return Promise.resolve(externalResult);
};
vm.runInNewContext(chromeSource, {window, document, URL, location: new URL("http://127.0.0.1:3080/"), console});
assert.equal(typeof window.__DSH_DESKTOP_OPEN_EXTERNAL_URL__, "function", "client must install authenticated external opener");
window.open("https://github.com/xinghaix/deepseek-harness-desktop/releases", "_blank", "noopener,noreferrer");
await flushMicrotasks();
assert.equal(externalCalls.length, 1, "toolbar must reach desktop RPC without Wails runtime");
assert.equal(externalCalls[0].channel, "/desktop-bridge");
assert.equal(externalCalls[0].payload.url, "https://github.com/xinghaix/deepseek-harness-desktop/releases");
assert.equal(externalAlerts.length, 0);
externalResult = {ok: false, error: {code: "desktop-bridge/unavailable"}};
window.open("https://example.com/");
await flushMicrotasks();
assert.equal(externalAlerts.length, 1, "native/transport rejection must reach visible feedback");
console.log("ok - actual chrome and bridge client integrate without Wails Call runtime");
const windowCalls = [];
ctx.connection.rpc.call = (channel, method, payload) => {windowCalls.push({channel,method,payload});return Promise.resolve({ok:true,value:{}});};
assert.equal(typeof window.__DSH_DESKTOP_WINDOW_ACTION__, "function", "window actions need authenticated transport without Wails runtime");
assert.equal(typeof window.__DSH_DESKTOP_CONTEXT_MENU__, "function", "custom menu needs authenticated transport without full runtime");
for (const action of ["minimize","maximize","close","settings","dismiss-config"]) await window.__DSH_DESKTOP_WINDOW_ACTION__(action);
await window.__DSH_DESKTOP_CONTEXT_MENU__({x:10,y:20,text:"selected",href:"https://example.com/"});
assert.equal(windowCalls.length,6);
assert.deepEqual(windowCalls.map(c=>c.method),["chatWindowAction","chatWindowAction","chatWindowAction","chatWindowAction","chatWindowAction","showChatContextMenu"]);
assert.equal(windowCalls[4].payload.action,"dismiss-config");
assert.equal(windowCalls[5].payload.x,10);
assert.ok(windowCalls.every(c=>c.channel==="/desktop-bridge"));
console.log("ok - remote controls and context menu use authenticated client transport");

// Test currentSessionId reporting and fallback
const directSessionReports = [];
const directClears = [];
ctx.connection.rpc.call = (_channel, method, payload) => {
  if (method === "claimOpenSession") {
    claimCalls += 1;
    return Promise.resolve({ ok: true, value: { sessionId: claimResult, requestId: claimRequestId } });
  }
  if (method === "reportSessions") reportedSessions.push(payload);
  if (method === "reportCurrentSession") directSessionReports.push(payload);
  if (method === "clearLastSession") directClears.push(payload);
  if (method === "prefs") {
    return Promise.resolve({ ok: true, value: { trayEnabled: true, traySessionLimit: 5 } });
  }
  return Promise.resolve({ ok: true, value: {} });
};
reportedSessions.length = 0;
snapshot = {
  phase: "ready",
  byId: {
    "session-valid": { id: "session-valid", blank: false, running: false },
    "session-blank": { id: "session-blank", blank: true, running: false },
    "session-archived": { id: "session-archived", blank: false, running: false }
  },
  ids: ["session-valid", "session-blank", "session-archived"],
  current: "session-valid"
};
workspaceSnapshot.archivedSessionIds = ["session-archived"];
listListener();
await flushMicrotasks();
const lastReport = reportedSessions[reportedSessions.length - 1];
assert.equal(lastReport.currentSessionId, "session-valid", "valid active session must be reported as currentSessionId");
assert.ok(directSessionReports.some((r) => r.sessionId === "session-valid"), "reportCurrentSession must receive valid active session");

snapshot.current = "session-blank";
listListener();
await flushMicrotasks();
const blankReport = reportedSessions[reportedSessions.length - 1];
assert.equal(blankReport.currentSessionId, "", "blank active session must report empty currentSessionId");

snapshot.current = "session-archived";
listListener();
await flushMicrotasks();
const archivedReport = reportedSessions[reportedSessions.length - 1];
assert.equal(archivedReport.currentSessionId, "", "archived active session must report empty currentSessionId");

// Test fallback for deleted and archived sessions in openSession
const openedCountBefore = opened.length;
window.__DSH_DESKTOP_OPEN_SESSION__("session-deleted", 88);
await flushMicrotasks();
assert.equal(opened.length, openedCountBefore, "non-existent session must not be opened and must fall back");

window.__DSH_DESKTOP_OPEN_SESSION__("session-archived", 89);
await flushMicrotasks();
assert.equal(opened.length, openedCountBefore, "archived session must not be opened and must fall back");
console.log("ok - current session reporting and deleted/archived fallback verified");
