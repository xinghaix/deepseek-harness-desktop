import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import model from "../lib/model.cjs";

const official = process.env.DSH_OFFICIAL_SOURCE_DIR;

test("official Gateway resolves unarchiveSession on the session resource, not global", { skip: !official && "Set DSH_OFFICIAL_SOURCE_DIR to verify against an official source checkout" }, async () => {
  const { callResources } = await import(pathToFileURL(join(official, "packages/api/gateway/src/access.ts")));
  const { ClientAccessState } = await import(pathToFileURL(join(official, "packages/api/remote-access/src/client/state.ts")));
  const read = path => readFileSync(join(official, path), "utf8");
  const sessionController = read("packages/api/session-controller/src/index.ts");
  const workspaceController = read("packages/api/workspace-controller/src/index.ts");
  assert.match(sessionController, /resources\.register\('session', \{ field: 'sessionId' \}\)/);
  assert.match(workspaceController, /resources\.register\('workspace', \{ field: 'workspaceId' \}\)/);
  assert.match(workspaceController, /@Remote\('unarchiveSession'\)/);
  const fields = [sessionController, workspaceController].flatMap(source =>
    [...source.matchAll(/resources\.register\('([^']+)', \{ field: '([^']+)' \}\)/g)].map(([, kind, field]) => ({ kind, field })));
  const resources = callResources({
    resources: { entries: () => fields },
    contexts: { getHost: () => undefined },
    lookups: { get: () => undefined },
  }, undefined, { invocation: { kind: "service" }, parameters: [{ wire: "request" }] }, { request: { sessionId: "a" } }, new AbortController().signal);
  assert.deepEqual(resources, [{ kind: "session", id: "a" }]);
  const globalOnly = new ClientAccessState({ type: "baseline", owner: false, grants: [
    { resource: { kind: "global" }, actions: [model.RESTORE_ACTION] },
  ] });
  assert.equal(globalOnly.resource("session", "a", model.RESTORE_ACTION).getSnapshot(), false);
  const sessionOnly = new ClientAccessState({ type: "baseline", owner: false, grants: [
    { resource: { kind: "session", id: "a" }, actions: [model.RESTORE_ACTION] },
  ] });
  assert.equal(sessionOnly.resource("session", "a", model.RESTORE_ACTION).getSnapshot(), true);
  assert.equal(sessionOnly.resource("session", "b", model.RESTORE_ACTION).getSnapshot(), false);
});
