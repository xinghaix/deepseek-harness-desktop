import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCandidateToolNames,
  exposesSandboxEscalation,
  KNOWN_ESCALATION_TOOL_NAMES,
  normalizeSandboxEscalation,
  patchToolDefinition,
} from "../lib/index.js";

function toolDefinition(execute, withEscalation = true) {
  return {
    name: "probe",
    description: "Probe tool",
    parameters: {
      type: "object",
      properties: withEscalation ? {
        value: { type: "string" },
        sandbox_permissions: {
          type: "string",
          enum: ["workspace-write", "danger-full-access"],
        },
        justification: { type: "string" },
      } : {
        value: { type: "string" },
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    execute,
  };
}

const exec = {
  agent: undefined,
};

test("removes a redundant danger-full-access request without mutating input", () => {
  const args = Object.freeze({
    value: "kept",
    sandbox_permissions: "danger-full-access",
    justification: "already granted",
  });

  const normalized = normalizeSandboxEscalation(args, "danger-full-access");

  assert.notEqual(normalized, args);
  assert.deepEqual(normalized, { value: "kept" });
  assert.equal(args.sandbox_permissions, "danger-full-access");
});

test("removes a redundant workspace-write request", () => {
  const normalized = normalizeSandboxEscalation({
    value: "kept",
    sandbox_permissions: "workspace-write",
    justification: "already granted",
  }, "workspace-write");

  assert.deepEqual(normalized, { value: "kept" });
});

test("skips same-or-narrower sandbox_permissions and keeps strictly wider ones", () => {
  const justification = "reason";
  const cases = [
    ["read-only", "workspace-write", "keep"],
    ["read-only", "danger-full-access", "keep"],
    ["workspace-write", "workspace-write", "strip"],
    ["workspace-write", "danger-full-access", "keep"],
    ["danger-full-access", "workspace-write", "strip"],
    ["danger-full-access", "danger-full-access", "strip"],
  ];

  for (const [current, requested, action] of cases) {
    const args = {
      value: "kept",
      sandbox_permissions: requested,
      justification,
    };
    const normalized = normalizeSandboxEscalation(args, current);
    if (action === "strip") {
      assert.deepEqual(
        normalized,
        { value: "kept" },
        `${current} + ${requested} should skip the no-op escalation`,
      );
    } else {
      assert.equal(
        normalized,
        args,
        `${current} + ${requested} should keep a strictly wider request`,
      );
    }
  }
});

test("preserves every genuinely wider escalation request", () => {
  const workspaceFromReadOnly = {
    sandbox_permissions: "workspace-write",
    justification: "write the workspace",
  };
  const dangerFromReadOnly = {
    sandbox_permissions: "danger-full-access",
    justification: "write outside the workspace",
  };
  const dangerFromWorkspace = {
    sandbox_permissions: "danger-full-access",
    justification: "write outside the workspace",
  };

  assert.equal(
    normalizeSandboxEscalation(workspaceFromReadOnly, "read-only"),
    workspaceFromReadOnly,
  );
  assert.equal(
    normalizeSandboxEscalation(dangerFromReadOnly, "read-only"),
    dangerFromReadOnly,
  );
  assert.equal(
    normalizeSandboxEscalation(dangerFromWorkspace, "workspace-write"),
    dangerFromWorkspace,
  );
});

test("removes a stale workspace-write request under danger-full-access", () => {
  const args = Object.freeze({
    value: "kept",
    sandbox_permissions: "workspace-write",
    justification: "stale escalation",
  });

  const normalized = normalizeSandboxEscalation(args, "danger-full-access");

  assert.notEqual(normalized, args);
  assert.deepEqual(normalized, { value: "kept" });
  assert.equal(args.sandbox_permissions, "workspace-write");
});

test("removes an orphan justification without mutating input", () => {
  const args = Object.freeze({
    value: "kept",
    justification: "orphan reason",
  });

  const normalized = normalizeSandboxEscalation(args, "workspace-write");

  assert.notEqual(normalized, args);
  assert.deepEqual(normalized, { value: "kept" });
  assert.equal(args.justification, "orphan reason");
});

test("fills missing or blank justification on genuinely wider requests", () => {
  const nonWider = {
    sandbox_permissions: "workspace-write",
    justification: "",
  };
  const blank = {
    sandbox_permissions: "workspace-write",
    justification: "   ",
  };
  const missing = {
    sandbox_permissions: "danger-full-access",
  };

  assert.deepEqual(
    normalizeSandboxEscalation(nonWider, "danger-full-access"),
    {},
  );
  assert.deepEqual(
    normalizeSandboxEscalation(blank, "read-only"),
    {
      sandbox_permissions: "workspace-write",
      justification: "Empty justification",
    },
  );
  assert.deepEqual(
    normalizeSandboxEscalation(missing, "workspace-write"),
    {
      sandbox_permissions: "danger-full-access",
      justification: "Empty justification",
    },
  );
  assert.equal(blank.justification, "   ");
  assert.equal(Object.hasOwn(missing, "justification"), false);
});

test("preserves illegal or unknown escalation target values", () => {
  const readOnly = {
    sandbox_permissions: "read-only",
    justification: "not a legal escalation target",
  };
  const unknown = {
    sandbox_permissions: "root",
    justification: "unknown target",
  };
  const nonStringJustification = {
    sandbox_permissions: "workspace-write",
    justification: null,
  };

  assert.equal(normalizeSandboxEscalation(readOnly, "danger-full-access"), readOnly);
  assert.equal(normalizeSandboxEscalation(unknown, "danger-full-access"), unknown);
  assert.equal(
    normalizeSandboxEscalation(nonStringJustification, "read-only"),
    nonStringJustification,
  );
});

test("leaves unrelated arguments untouched", () => {
  const args = { value: "plain" };
  assert.equal(normalizeSandboxEscalation(args, "danger-full-access"), args);
  assert.equal(normalizeSandboxEscalation(null, "danger-full-access"), null);
});

test("detects only tools that expose the paired escalation fields", () => {
  assert.equal(exposesSandboxEscalation(toolDefinition(async () => "ok")), true);
  assert.equal(exposesSandboxEscalation(toolDefinition(async () => "ok", false)), false);
});

test("detects escalation fields when parameters is a getter", () => {
  const definition = toolDefinition(async () => "ok");
  const staticParams = definition.parameters;
  Object.defineProperty(definition, "parameters", {
    enumerable: true,
    configurable: true,
    get: () => staticParams,
  });
  assert.equal(exposesSandboxEscalation(definition), true);
});

test("known DSH 0.1.6 escalation tools include run_code", () => {
  assert.deepEqual(
    [...KNOWN_ESCALATION_TOOL_NAMES],
    ["bash", "pwsh", "write", "edit", "run_code"],
  );
});

test("candidate names always include known tools and union schemas()", () => {
  const withoutSchemas = collectCandidateToolNames({
    get: () => undefined,
  }, undefined);
  assert.deepEqual(withoutSchemas, [...KNOWN_ESCALATION_TOOL_NAMES]);

  const withSchemas = collectCandidateToolNames({
    get: () => undefined,
    schemas: () => [
      { name: "run_code" },
      { name: "future_shell" },
      { name: "" },
      { name: 1 },
      {},
    ],
  }, undefined);
  assert.ok(withSchemas.includes("run_code"));
  assert.ok(withSchemas.includes("future_shell"));
  assert.ok(withSchemas.includes("bash"));
  assert.equal(withSchemas.includes(""), false);
});

test("candidate names keep known tools when schemas() throws", () => {
  const names = collectCandidateToolNames({
    get: () => undefined,
    schemas: () => {
      throw new Error("no runtime");
    },
  }, undefined, () => {});
  assert.deepEqual(names, [...KNOWN_ESCALATION_TOOL_NAMES]);
});

test("patch normalizes at execution time and restores the original function", async () => {
  const received = [];
  let mode = "danger-full-access";
  const definition = toolDefinition(async function (args) {
    received.push({ args, receiver: this });
    return "ok";
  });
  const original = definition.execute;
  const patch = patchToolDefinition(definition, () => mode);

  assert.ok(patch);
  assert.notEqual(definition.execute, original);

  const result = await definition.execute({
    value: "first",
    sandbox_permissions: "danger-full-access",
    justification: "same mode",
  }, exec);
  assert.equal(result, "ok");
  assert.deepEqual(received[0].args, { value: "first" });
  assert.equal(received[0].receiver, definition);

  await definition.execute({
    value: "lower",
    sandbox_permissions: "workspace-write",
    justification: "stale lower target",
  }, exec);
  assert.deepEqual(received[1].args, { value: "lower" });

  mode = "read-only";
  const wider = {
    value: "second",
    sandbox_permissions: "workspace-write",
    justification: "wider mode",
  };
  await definition.execute(wider, exec);
  assert.equal(received[2].args, wider);

  await definition.execute({
    value: "third",
    sandbox_permissions: "danger-full-access",
  }, exec);
  assert.deepEqual(received[3].args, {
    value: "third",
    sandbox_permissions: "danger-full-access",
    justification: "Empty justification",
  });

  patch.restore();
  assert.equal(definition.execute, original);
});

test("run_code wrapper swallows not-strictly-wider throws", async () => {
  const wider = {
    "read-only": ["workspace-write", "danger-full-access"],
    "workspace-write": ["danger-full-access"],
  };
  const definition = toolDefinition(async (args) => {
    const requested = args.sandbox_permissions;
    const current = "danger-full-access";
    if (requested !== undefined && !(wider[current] ?? []).includes(requested)) {
      throw new Error(
        `sandbox escalation to "${requested}" is not strictly wider than this call's current "${current}" mode`,
      );
    }
    return "ok";
  });
  definition.name = "run_code";
  patchToolDefinition(definition, () => "danger-full-access");

  assert.equal(
    await definition.execute({
      value: "same",
      sandbox_permissions: "danger-full-access",
      justification: "already granted",
    }, exec),
    "ok",
  );
  assert.equal(
    await definition.execute({
      value: "narrower",
      sandbox_permissions: "workspace-write",
      justification: "stale lower target",
    }, exec),
    "ok",
  );
});

test("an unloaded wrapper stays inert if a later plugin restores it", async () => {
  const received = [];
  const definition = toolDefinition(async (args) => {
    received.push(args);
    return "ok";
  });
  const patch = patchToolDefinition(definition, () => "danger-full-access");
  assert.ok(patch);
  const ownedWrapper = definition.execute;

  const laterWrapper = async () => "later";
  definition.execute = laterWrapper;
  patch.restore();
  assert.equal(definition.execute, laterWrapper);

  // Simulate the later plugin unloading and restoring the predecessor it captured.
  definition.execute = ownedWrapper;
  const args = {
    sandbox_permissions: "danger-full-access",
    justification: "must remain after unload",
  };
  await definition.execute(args, exec);
  assert.equal(received[0], args);
});

test("rejects a frozen definition without changing its execute function", () => {
  const definition = Object.freeze(toolDefinition(async () => "ok"));
  const original = definition.execute;

  assert.throws(
    () => patchToolDefinition(definition, () => "danger-full-access"),
    /execute is not a writable own property/,
  );
  assert.equal(definition.execute, original);
});

test("does not patch tools without escalation parameters", () => {
  const definition = toolDefinition(async () => "ok", false);
  const original = definition.execute;
  assert.equal(patchToolDefinition(definition, () => "danger-full-access"), undefined);
  assert.equal(definition.execute, original);
});
