const assert = require("node:assert/strict");
const test = require("node:test");
const { archiveAvailability, archiveRows, createRestoreRunner } = require("../lib/model.cjs");

const config = { status: "ready", value: { archiveManager: true } };
const sessions = {
  phase: "ready", ids: ["a", "b", "child", "blank"],
  byId: {
    a: { displayTitle: "Alpha", updatedAt: 2, cwd: "/alpha" },
    b: { title: "Beta", updatedAt: 8 },
    child: { origin: "subagent", updatedAt: 10 },
    blank: { blank: true, title: "Blank", updatedAt: 0 },
    fallback: { origin: "subagent", displayTitle: "Not a Host member" },
  },
};
const workspaces = {
  phase: "ready", state: "idle", archivedSessionIds: ["a", "a", "b", "child", "missing", "blank"],
  items: [{ title: "Project B", sessionIds: ["b"] }],
};

test("availability distinguishes settings, disabled, services, slot and baseline readiness", () => {
  assert.equal(archiveAvailability(undefined, sessions, workspaces, true, true), "reasonSettings");
  assert.equal(archiveAvailability({ ...config, status: "unavailable" }, sessions, workspaces, true, true), "reasonSettings");
  assert.equal(archiveAvailability({ status: "ready", value: {} }, sessions, workspaces, true, true), "reasonSettings");
  assert.equal(archiveAvailability({ ...config, value: { archiveManager: false } }, sessions, workspaces, true, true), "reasonDisabled");
  assert.equal(archiveAvailability(config, sessions, workspaces, false, true), "reasonServices");
  assert.equal(archiveAvailability(config, sessions, workspaces, true, false), "reasonSlot");
  assert.equal(archiveAvailability(config, { phase: "pending" }, workspaces, true, true), "reasonLoading");
  assert.equal(archiveAvailability(config, sessions, { ...workspaces, state: "error" }, true, true), "reasonConnection");
  assert.equal(archiveAvailability(config, sessions, { ...workspaces, phase: "pending", state: "error" }, true, true), "reasonConnection");
  assert.equal(archiveAvailability(config, sessions, workspaces, true, true), null);
});

test("rows deduplicate archive ids, exclude known subagents and retain metadata gaps", () => {
  const rows = archiveRows(sessions, workspaces);
  assert.deepEqual(rows.map(row => row.id), ["b", "a", "blank", "missing"]);
  assert.equal(rows[0].workspace, "Project B");
  assert.equal(rows[1].workspace, "/alpha");
  assert.equal(rows.find(row => row.id === "missing").missing, true);
  assert.equal(rows.find(row => row.id === "blank").missing, false);
});

test("retained byId fallbacks do not masquerade as Host metadata", () => {
  const [row] = archiveRows(sessions, { ...workspaces, archivedSessionIds: ["fallback"] });
  assert.equal(row.title, "fallback");
  assert.equal(row.missing, true);
});

test("filter matches title, identity and workspace without changing selection semantics", () => {
  assert.deepEqual(archiveRows(sessions, workspaces, " ALPHA ").map(row => row.id), ["a"]);
  assert.deepEqual(archiveRows(sessions, workspaces, "project b").map(row => row.id), ["b"]);
  assert.deepEqual(archiveRows(sessions, workspaces, "missing").map(row => row.id), ["missing"]);
  assert.deepEqual(archiveRows(sessions, workspaces, "nonexistent"), []);
});

test("batch is serial, deduplicated and retains partial failures without raw diagnostics", async () => {
  let active = 0;
  const calls = [];
  const runner = createRestoreRunner({
    inspect: () => ({ archived: true, allowed: true }),
    async restore(id) {
      assert.equal(++active, 1);
      calls.push(id);
      await Promise.resolve();
      active--;
      if (id === "b") throw new Error("secret-token=must-not-escape");
    },
  });
  assert.equal(await runner.run(["a", "b", "a", "c"]), true);
  assert.deepEqual(calls, ["a", "b", "c"]);
  assert.deepEqual(runner.getSnapshot().restored, ["a", "c"]);
  assert.deepEqual(runner.getSnapshot().failed, [{ id: "b", reason: "operationFailed" }]);
  assert.equal(runner.getSnapshot().done, 3);
  assert.doesNotMatch(JSON.stringify(runner.getSnapshot()), /secret-token/);
});

test("batch rechecks permission, membership and readiness for each item", async () => {
  const calls = [];
  const runner = createRestoreRunner({
    inspect: id => ({ reason: id === "a" ? "reasonConnection" : null, archived: id !== "b", allowed: id !== "c" }),
    restore: async id => calls.push(id),
  });
  await runner.run(["a", "b", "c", "d"]);
  assert.deepEqual(calls, ["d"]);
  assert.deepEqual(runner.getSnapshot().failed.map(item => item.reason), ["reasonConnection", "permissionDenied"]);
  assert.equal(runner.getSnapshot().skipped[0].reason, "noLongerArchived");
});

test("stop does not pretend to cancel the in-flight write and starts no next item", async () => {
  let finish;
  const calls = [];
  const runner = createRestoreRunner({
    inspect: () => ({ archived: true, allowed: true }),
    restore: id => { calls.push(id); return new Promise(resolve => { finish = resolve; }); },
  });
  const pending = runner.run(["a", "b"]);
  runner.stop();
  assert.equal(runner.getSnapshot().running, true);
  assert.deepEqual(calls, ["a"]);
  finish(); await pending;
  assert.deepEqual(calls, ["a"]);
  assert.deepEqual(runner.getSnapshot().restored, ["a"]);
  assert.equal(runner.getSnapshot().cancelled, true);
});

test("stop during the last request reports its real success, not a fictitious cancellation", async () => {
  let finish;
  const runner = createRestoreRunner({
    inspect: () => ({ archived: true, allowed: true }),
    restore: () => new Promise(resolve => { finish = resolve; }),
  });
  const pending = runner.run(["a"]);
  runner.stop();
  assert.equal(runner.getSnapshot().stopping, true);
  finish(); await pending;
  assert.deepEqual(runner.getSnapshot().restored, ["a"]);
  assert.equal(runner.getSnapshot().cancelled, false);
  assert.equal(runner.getSnapshot().stopping, false);
});

test("double starts are refused; disposal suppresses late notifications and new calls", async () => {
  let finish;
  let events = 0;
  const calls = [];
  const runner = createRestoreRunner({
    inspect: () => ({ archived: true, allowed: true }),
    restore: id => { calls.push(id); return new Promise(resolve => { finish = resolve; }); },
    changed: () => { events++; },
  });
  const pending = runner.run(["a", "b"]);
  assert.equal(await runner.run(["c"]), false);
  runner.dispose(); const before = events;
  finish(); await pending;
  assert.equal(events, before);
  assert.deepEqual(calls, ["a"]);
  assert.equal(await runner.run(["c"]), false);
});
