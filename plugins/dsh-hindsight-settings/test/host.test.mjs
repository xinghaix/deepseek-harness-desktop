import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, STATE_PATH, SAVE_PATH } from "../lib/index.js";

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "dhs-host-"));
  const previous = process.env.HINDSIGHT_CONFIG;
  process.env.HINDSIGHT_CONFIG = join(directory, "config.json");
  await writeFile(process.env.HINDSIGHT_CONFIG, '{"apiToken":"not-for-browser"}');
  const routes = new Map(); const tools = new Map(); const disposers = [];
  const ctx = {
    fiber: {},
    workspaceRegistry: { list: () => [{ id: "fixture", title: "Fixture", path: directory }] },
    connection: {
      admit: request => request.headers.get("authorization") === "fixture-owner" ? { peer: { principal: { kind: "owner" } } } : { rejection: 401 },
      fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } },
    },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); }, get(name) { return name === "hindsight_diagnose" ? {} : tools.get(name); } },
    effect(fn) { const disposer = fn(); disposers.push(disposer); return disposer; },
    inject(_names, fn) { fn({ effect: fn => ctx.effect(fn), settings: { configure: () => () => {} } }); },
  };
  apply(ctx);
  t.after(async () => {
    for (const dispose of disposers.reverse()) await dispose();
    assert.equal(routes.size, 0); assert.equal(tools.size, 0);
    if (previous === undefined) delete process.env.HINDSIGHT_CONFIG; else process.env.HINDSIGHT_CONFIG = previous;
    assert.ok(directory.startsWith(join(tmpdir(), "dhs-host-")));
    await rm(directory, { recursive: true });
  });
  const call = (path, body, headers = { authorization: "fixture-owner" }) => routes.get(path).fetch(new Request("http://localhost" + path, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return { call, tools, path: process.env.HINDSIGHT_CONFIG };
}
test("原生认证路由与只读工具查询一致；保存授权仅用户可操作", async t => {
  const { call, tools, path } = await setup(t);
  const ui = await (await call(STATE_PATH)).json();
  const tool = tools.get("hindsight_settings_status");
  assert.deepEqual(ui.status, await tool.execute({}));
  assert.ok(!JSON.stringify(ui).includes("not-for-browser"));
  assert.deepEqual([...tools.keys()], ["hindsight_settings_status"]);
  assert.deepEqual(Object.keys(tool.parameters.properties), ["workspaceId"]);
  const body = { revision: ui.status.revision, dshEnabled: false };
  const result = await (await call(SAVE_PATH, body)).json();
  assert.equal(result.ok, true); assert.equal(result.status.dshEnabled, false);
  assert.deepEqual(result.status, await tool.execute({}));
  assert.equal(JSON.parse(await readFile(path, "utf8")).apiToken, "not-for-browser");
});
test("拒绝未授权和跨站写入，不提供凭据或任意路径修改", async t => {
  const { call, path } = await setup(t);
  assert.equal((await call(STATE_PATH, undefined, {})).status, 403);
  const ui = await (await call(STATE_PATH)).json();
  const body = { revision: ui.status.revision, dshEnabled: false };
  assert.equal((await call(SAVE_PATH, body, { authorization: "fixture-owner", "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await call(SAVE_PATH, { ...body, apiToken: "overwrite" })).status, 400);
  assert.equal(JSON.parse(await readFile(path, "utf8")).harnesses, undefined);
});
