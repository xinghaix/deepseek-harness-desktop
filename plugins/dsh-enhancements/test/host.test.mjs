import assert from "node:assert/strict";
import test from "node:test";
import { Config, apply, name } from "../lib/index.js";

function schemaNodes() {
  return Object.values(Config.toJSON().refs);
}

test("Host exposes only a live archive setting, with no persistence or control routes", () => {
  assert.equal(name, "dsh-enhancements");
  const nodes = schemaNodes();
  const object = nodes.find(node => node.type === "object");
  assert.deepEqual(Object.keys(object.dict), ["archiveManager"]);
  const field = nodes.find(node => node.type === "boolean");
  assert.equal(field.meta.volatile, true);
  assert.equal(field.meta.default, true);
  const ctx = { inject(keys, callback) {
    assert.deepEqual(keys, ["settings"]);
    const fiber = {};
    ctx.fiber = fiber;
    callback({
      settings: { configure(policy, owner) { assert.deepEqual(policy, { auto: false }); assert.equal(owner, fiber); return () => {}; } },
      effect(fn) { fn(); },
    });
  } };
  apply(ctx);
});
