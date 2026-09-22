import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "./lib/index.js";

const cleanups = [];
let registeredHandler;
const emittedEvents = [];
const services = {};
const rootContext = {
  get(name) { return services[name]; },
  emit(name, ...args) { emittedEvents.push([name, ...args]); },
  effect(factory) { const cleanup = factory(); if (typeof cleanup === "function") cleanups.push(cleanup); },
  inject(deps, callback) {
    if (deps.includes("sessions")) { callback({ on() {} }); return; }
    callback({
      connection: { requestRejection() { return undefined; } },
      webServer: { register({ handler }) { registeredHandler = handler; return () => {}; } },
      effect(factory) { const cleanup = factory(); if (typeof cleanup === "function") cleanups.push(cleanup); },
    });
  },
};

const root = await mkdtemp(join(tmpdir(), "dsh-session-delete-test-"));
const sessionDir = join(root, "project", "session-test");
const artifactPath = join(sessionDir, "session.jsonl");
await mkdir(sessionDir, { recursive: true });
await writeFile(artifactPath, "header\n");
let artifacts = [{ header: { id: "session-test" }, path: artifactPath }];
let unarchived = "";
let detached = "";
services.sessionPersistence = { root, async listArtifacts() { return artifacts; } };
services.sessions = { get() { return undefined; } };
services.agents = { get() { return undefined; } };
services.workspaceRegistry = {
  async unarchiveSession(id) { unarchived = id; },
  list() { return [{ sessionIds: ["session-test"], async detachSession(id) { detached = id; } }]; },
};
apply(rootContext);
assert.equal(typeof registeredHandler, "function", "desktop bridge route handler missing");

async function request(sessionId, rpcId = "test") {
  const response = { status: 0, body: "", headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; }, end(body) { this.body = String(body ?? ""); } };
  const req = {
    url: "/desktop-bridge/deleteSession",
    method: "POST",
    headers: { "content-type": "application/json" },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ type: "client-request", rpcId, method: "deleteSession", payload: { sessionId } })); },
  };
  await registeredHandler(req, response);
  assert.equal(response.status, 200);
  return JSON.parse(response.body).result;
}

const deleted = await request("session-test");
assert.equal(deleted.ok, true);
assert.deepEqual(deleted.value, { sessionId: "session-test", deleted: true });
await assert.rejects(access(artifactPath));
assert.equal(unarchived, "session-test");
assert.equal(detached, "session-test");
assert.deepEqual(emittedEvents, [["api-session/removed", "session-test"]], "cold deletion must evict the deleted id from the renderer session catalog");

const invalid = await request("../escape", "invalid");
assert.equal(invalid.ok, false);
assert.equal(invalid.error.code, "desktop-bridge/delete-invalid-id");

const activePath = join(root, "project", "session-active", "session.jsonl");
await mkdir(join(root, "project", "session-active"), { recursive: true });
await writeFile(activePath, "active\n");
artifacts = [{ header: { id: "session-active" }, path: activePath }];
services.agents.get = () => ({});
const unsupported = await request("session-active", "active");
assert.equal(unsupported.ok, false);
assert.equal(unsupported.error.code, "desktop-bridge/delete-unsupported");
await access(activePath);

let activeLive = true;
let activeDisposed = false;
let activeWorkspaceVisible = true;
const activeDeletePath = join(root, "project", "session-active-delete", "session.jsonl");
await mkdir(join(root, "project", "session-active-delete"), { recursive: true });
await writeFile(activeDeletePath, "active-delete\n");
artifacts = [{ header: { id: "session-active-delete" }, path: activeDeletePath }];
services.agents.get = () => activeLive ? {
  scope: {
    async dispose() {
      activeDisposed = true;
      activeLive = false;
      activeWorkspaceVisible = false;
    },
  },
} : undefined;
services.sessions.get = () => activeLive ? {} : undefined;
services.workspaceRegistry = {
  async unarchiveSession(id) { unarchived = id; },
  list() {
    return [{
      get sessionIds() { return activeWorkspaceVisible ? ["session-active-delete"] : []; },
      async detachSession(id) { detached = id; },
    }];
  },
};
emittedEvents.length = 0;
const activeDeleted = await request("session-active-delete", "active-delete");
assert.equal(activeDeleted.ok, true);
assert.deepEqual(emittedEvents, [["api-session/removed", "session-active-delete"]], "live deletion must evict the deleted id from the renderer session catalog");
await assert.rejects(access(activeDeletePath));
assert.equal(activeDisposed, true);
assert.equal(detached, "session-active-delete", "active deletion must detach workspace membership before disposal invalidates it");

artifacts = [];
services.agents.get = () => undefined;
let staleUnarchived = "";
const staleDetached = [];
services.workspaceRegistry = {
  archivedSessionIds: ["session-stale"],
  async unarchiveSession(id) { staleUnarchived = id; },
  list() {
    return [
      { sessionIds: [], async detachSession(id) { staleDetached.push(["one", id]); } },
      { sessionIds: [], async detachSession(id) { staleDetached.push(["two", id]); } },
    ];
  },
};
emittedEvents.length = 0;
const stale = await request("session-stale", "stale");
assert.equal(stale.ok, true, "archived metadata without an artifact must still be cleanable");
assert.deepEqual(stale.value, { sessionId: "session-stale", deleted: true });
assert.equal(staleUnarchived, "session-stale");
assert.deepEqual(staleDetached, [["one", "session-stale"], ["two", "session-stale"]]);
assert.deepEqual(emittedEvents, [["api-session/removed", "session-stale"]]);

const missing = await request("session-missing", "missing");
assert.equal(missing.ok, false);
assert.equal(missing.error.code, "desktop-bridge/delete-not-found");

for (const cleanup of cleanups) cleanup();
await rm(root, { recursive: true, force: true });
console.log("ok - host deleteSession validates, deletes, cleans metadata, and fails closed");
