import assert from "node:assert/strict";
import { test } from "node:test";
import { observeNotifications } from "./lib/notifications.js";

const scope = Symbol.for("deepseek-harness-desktop.notifications.host");

test("通知 Host 投影：真实待输入、终态去重、恢复与主动取消", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 40000 });
  t.after(() => { delete globalThis[scope]; });
  const listeners = new Map();
  const events = [];
  const main = { id: "session-main", header: { cwd: "/work" } };
  const child = { id: "session-child", header: { cwd: "/work", origin: "subagent" } };
  const archived = { id: "session-archived", header: { cwd: "/work" } };
  const sessions = new Map([main, child, archived].map(s => [s.id, s]));
  let pending = [];
  let continued = false;
  let goal;
  const prefs = {enabled:true, question:true, approval:true, completed:true, interrupted:true, error:true};
  const ctx = {
    on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); },
    get(name) {
      return {
        sessions,
        agents: {get: id => ({session:sessions.get(id)})},
        workspaceRegistry: { archivedSessionIds: [archived.id] },
        typertGateway: { getPendingRemoteEvents: () => pending },
        sessionProjections: { snapshot: () => ({ values: {userQuestions:{active:continued ? [{state:"continued"}] : []}} }) },
        goal:{get:() => goal},
      }[name];
    }
  };
  const install = () => observeNotifications(ctx, async event => events.push(event), async () => prefs);
  const step = async (ms) => {
    t.mock.timers.tick(ms);
    for (let i = 0; i < 30; i++) await Promise.resolve();
  };
  const emit = (name, ...args) => listeners.get(name)?.(...args);
  const logs = (kind, data, seq, session = main) => emit("session/event", session, {type:kind, data, seq});
  const sent = () => events.filter(event => event.kind !== "running" && !event.closed).map(event => event.kind);
  const turn = (n, kind, session = main) => {
    logs("turn/start", {turn:n}, n * 10, session);
    logs("turn/end", {turn:n, reason:{kind}}, n * 10 + 1, session);
    emit("api-session/status", session.id, false);
  };

  const baseline = {agentId:main.id, event:"approval/request"};
  pending = [baseline];
  const first = install();
  await step(0);
  await step(450);
  assert.deepEqual(sent(), [], "初始快照不重发");
  pending = [];
  await step(450);

  logs("turn/start", {turn:1}, 10);
  logs("tool/call", {name:"exit_plan_mode", callId:"plan-review"}, 11);
  pending = [{agentId:main.id, event:"user-questions/request"}, {agentId:child.id, event:"approval/request"}];
  await step(450);
  assert.deepEqual(sent(), ["plan-review"]);
  const question = events.find(event => event.kind === "plan-review");
  pending = [];
  continued = true;
  await step(450);
  assert.equal(events.some(event => event.closed && event.key === question.key), false);
  first.dispose();
  const second = install();
  t.after(() => second.dispose());
  await step(0);
  assert.deepEqual(sent(), ["plan-review"], "Host 重新加载不重发待处理的通知");
  logs("turn/end", {turn:1, reason:{kind:"completed"}}, 12);
  emit("api-session/status", main.id, false);
  await step(450);
  assert.deepEqual(sent(), ["plan-review"], "未回答时不报任务完成");
  continued = false;
  await step(450);
  await step(450);
  assert.ok(events.some(event => event.closed && event.key === question.key));

  pending = [baseline];
  await step(450);
  assert.deepEqual(sent(), ["plan-review", "approval"]);
  pending = [];
  await step(450);

  logs("turn/start", {turn:2}, 20);
  emit("api-session/error", main.id, "must not be forwarded");
  logs("turn/end", {turn:2, reason:{kind:"error", error:{message:"sensitive"}}}, 21);
  emit("api-session/status", main.id, false);
  await step(700);
  assert.deepEqual(sent(), ["plan-review", "approval", "error"]);
  assert.ok(events.every(event => !JSON.stringify(event).includes("sensitive")));

  turn(3, "aborted");
  turn(4, "completed", archived);
  logs("turn/end", {turn:9, reason:{kind:"interrupted"}}, 90);
  await step(450);
  assert.equal(sent().length, 3, "主动停止、归档和旧记录修复静默");
  turn(5, "max-tokens");
  await step(450);
  goal = {phase:"active", activation:"armed"};
  turn(6, "completed");
  await step(450);
  assert.deepEqual(sent(), ["plan-review", "approval", "error", "interrupted"]);
  goal = {phase:"complete", activation:"disarmed"};
  logs("turn/start", {turn:7}, 70);
  logs("goal/change", {operation:"complete"}, 71);
  logs("turn/end", {turn:7, reason:{kind:"completed"}}, 72);
  emit("api-session/status", main.id, false);
  await step(450);
  assert.deepEqual(sent(), ["plan-review", "approval", "error", "interrupted", "completed"]);
});
