import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SandboxMode } from "@deepseek-ai/dsh-sandbox";
import type {} from "@deepseek-ai/dsh-sandbox-policy";
import type {
  ToolDefinition,
  ToolRunContext,
} from "@deepseek-ai/dsh-tools";

export const name = "sandbox-escalation-fix";
export const inject = ["agents", "tools", "sandboxPolicy"];

/**
 * Built-in DSH tools and common host-compatible shell extensions (`dsh-ops`)
 * that advertise sandbox escalation (`sandbox_permissions` + `justification`).
 * `schemas()` may add other first-party or plugin tools exposing the same pair.
 */
export const KNOWN_ESCALATION_TOOL_NAMES = [
  "bash",
  "pwsh",
  "write",
  "edit",
  "run_code",
  "ops_bash",
] as const;

const SANDBOX_MODE_RANK: Readonly<Record<SandboxMode, number>> = {
  "read-only": 0,
  "workspace-write": 1,
  "danger-full-access": 2,
};
const EMPTY_JUSTIFICATION = "Empty justification";

type MutableToolDefinition = {
  -readonly [Key in keyof ToolDefinition]: ToolDefinition[Key];
};

type ModeResolver = (exec: ToolRunContext) => SandboxMode;

type ToolLookup = {
  get(name: string, scope?: unknown): ToolDefinition | undefined;
  schemas?(scope?: unknown): ReadonlyArray<{
    readonly name?: unknown;
    readonly parameters?: unknown;
  }>;
};

export interface ToolDefinitionPatch {
  readonly definition: ToolDefinition;
  restore(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isExecutorUnavailableError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === "TOOL_EXECUTOR_UNAVAILABLE" || error.name === "ToolExecutorUnavailableError") {
    return true;
  }
  return typeof error.message === "string"
    && error.message.includes("no tool executor is active in the selected scope");
}

function hasEscalationProperties(parameters: unknown): boolean {
  if (!isRecord(parameters)) return false;
  const properties = parameters.properties;
  return isRecord(properties)
    && Object.hasOwn(properties, "sandbox_permissions")
    && Object.hasOwn(properties, "justification");
}

export function exposesSandboxEscalation(
  definition: ToolDefinition,
): boolean {
  return hasEscalationProperties(definition.parameters);
}

/**
 * Drop a sandbox escalation that is not strictly wider than the session's
 * current mode, strip null/blank escalation placeholders or orphan reasons,
 * and fill a fallback reason when a genuinely wider request omits one.
 */
export function normalizeSandboxEscalation(
  args: unknown,
  currentMode: SandboxMode,
): unknown {
  if (!isRecord(args)) return args;
  const requestedMode = args.sandbox_permissions;
  if (
    requestedMode === undefined
    || requestedMode === null
    || (typeof requestedMode === "string" && requestedMode.trim() === "")
  ) {
    if (
      !Object.hasOwn(args, "sandbox_permissions")
      && !Object.hasOwn(args, "justification")
    ) return args;
    const normalized = { ...args };
    delete normalized.sandbox_permissions;
    delete normalized.justification;
    return normalized;
  }
  if (
    requestedMode !== "workspace-write"
    && requestedMode !== "danger-full-access"
  ) return args;

  if (SANDBOX_MODE_RANK[requestedMode] <= SANDBOX_MODE_RANK[currentMode]) {
    const normalized = { ...args };
    delete normalized.sandbox_permissions;
    delete normalized.justification;
    return normalized;
  }

  if (
    args.justification === undefined
    || args.justification === null
    || (typeof args.justification === "string" && args.justification.trim() === "")
  ) {
    return { ...args, justification: EMPTY_JUSTIFICATION };
  }

  return args;
}

function hasStaticParameters(definition: ToolDefinition): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(definition, "parameters");
  return descriptor !== undefined && "value" in descriptor;
}

export function patchToolDefinition(
  definition: ToolDefinition,
  resolveMode: ModeResolver,
): ToolDefinitionPatch | undefined {
  if (!exposesSandboxEscalation(definition)) return undefined;

  const descriptor = Object.getOwnPropertyDescriptor(definition, "execute");
  if (descriptor === undefined || !("value" in descriptor) || descriptor.writable !== true) {
    throw new Error(
      `sandbox-escalation-fix: tool "${definition.name}" execute is not a writable own property`,
    );
  }

  const mutable = definition as MutableToolDefinition;
  const original = definition.execute;
  let active = true;
  const wrapped = async function (
    this: ToolDefinition,
    args: unknown,
    exec: ToolRunContext,
  ): Promise<unknown> {
    const forwarded = active
      ? normalizeSandboxEscalation(args, resolveMode(exec))
      : args;
    return original.call(this, forwarded, exec);
  };

  try {
    mutable.execute = wrapped;
    if (definition.execute !== wrapped) {
      throw new Error("the assignment did not install the wrapper");
    }
  } catch (error) {
    active = false;
    try {
      if (definition.execute === wrapped) mutable.execute = original;
    } catch {
      // Preserve the first installation failure.
    }
    throw new Error(
      `sandbox-escalation-fix: failed to wrap tool "${definition.name}" execute`,
      { cause: error },
    );
  }

  return {
    definition,
    restore(): void {
      active = false;
      try {
        if (definition.execute === wrapped) mutable.execute = original;
      } catch {
        // The inactive wrapper is a safe pass-through if another owner froze it.
      }
    },
  };
}

export function collectCandidateToolNames(
  tools: ToolLookup,
  agent: Agent | undefined,
  onSchemasError?: (error: unknown) => void,
): string[] {
  const names = new Set<string>(KNOWN_ESCALATION_TOOL_NAMES);
  if (typeof tools.schemas !== "function") return [...names];
  try {
    const schemas = tools.schemas(agent);
    if (!Array.isArray(schemas)) return [...names];
    for (const schema of schemas) {
      if (!isRecord(schema) || !isToolName(schema.name)) continue;
      if (isRecord(schema.parameters) && !hasEscalationProperties(schema.parameters)) continue;
      names.add(schema.name);
    }
  } catch (error) {
    onSchemasError?.(error);
  }
  return [...names];
}

export function apply(ctx: Context): void {
  const patches = new Map<ToolDefinition, ToolDefinitionPatch>();
  const incompatible = new WeakSet<ToolDefinition>();
  const nonEscalating = new WeakSet<ToolDefinition>();

  const resolveMode: ModeResolver = (exec) => ctx.sandboxPolicy.resolve(
    exec.agent === undefined ? undefined : { session: exec.agent.session },
  ).mode;

  const restore = (selected: readonly ToolDefinitionPatch[]): void => {
    for (const patch of [...selected].reverse()) {
      patches.delete(patch.definition);
      patch.restore();
    }
  };

  const restoreAll = (): void => {
    const activePatches = [...patches.values()];
    patches.clear();
    for (const patch of activePatches.reverse()) patch.restore();
  };

  const resolveExecutorTool = (
    toolName: string,
    agent: Agent | undefined,
  ): ToolDefinition | undefined => {
    const rawTools = ctx.tools as unknown;
    if (!isRecord(rawTools) || typeof rawTools.selectExecutor !== "function") return undefined;
    try {
      const executor = rawTools.selectExecutor(agent);
      if (!isRecord(executor)) return undefined;
      if (toolName === "run_code" && typeof executor.requirePtcTransport === "function") {
        const candidate = executor.requirePtcTransport();
        if (isRecord(candidate)) return candidate as unknown as ToolDefinition;
      }
      if (isRecord(executor.pipeline) && typeof executor.pipeline.get === "function") {
        const candidate = executor.pipeline.get(toolName, agent);
        if (isRecord(candidate)) return candidate as unknown as ToolDefinition;
      }
    } catch {
      // Executor may not be active yet in the selected scope; setExecutor hook will rescan.
    }
    return undefined;
  };

  const lookupVisible = (
    agent: Agent | undefined,
    onError?: {
      schemas?: (error: unknown) => void;
      get?: (toolName: string, error: unknown) => void;
    },
  ): { definitions: ToolDefinition[]; complete: boolean } => {
    let complete = true;
    const names = collectCandidateToolNames(ctx.tools as ToolLookup, agent, (error) => {
      if (isExecutorUnavailableError(error)) return;
      complete = false;
      onError?.schemas?.(error);
    });
    const definitions: ToolDefinition[] = [];
    for (const toolName of names) {
      try {
        const definition = ctx.tools.get(toolName, agent) ?? resolveExecutorTool(toolName, agent);
        if (definition !== undefined) definitions.push(definition);
      } catch (error) {
        complete = false;
        if (onError?.get === undefined) throw error;
        onError.get(toolName, error);
      }
    }
    return { definitions, complete };
  };

  const patchVisibleTools = (
    agent: Agent | undefined,
    added: ToolDefinitionPatch[],
  ): void => {
    for (const definition of lookupVisible(agent).definitions) {
      if (patches.has(definition) || nonEscalating.has(definition)) continue;
      const patch = patchToolDefinition(definition, resolveMode);
      if (patch === undefined) {
        if (hasStaticParameters(definition)) nonEscalating.add(definition);
        continue;
      }
      patches.set(definition, patch);
      added.push(patch);
    }
  };

  const scanTransaction = (agents: readonly (Agent | undefined)[]): void => {
    const added: ToolDefinitionPatch[] = [];
    try {
      for (const agent of agents) patchVisibleTools(agent, added);
    } catch (error) {
      restore(added);
      throw error;
    }
  };

  const scanAll = (): void => {
    scanTransaction([undefined, ...ctx.agents.list()]);
  };

  const errorText = (error: unknown): string => {
    try {
      return error instanceof Error ? error.message : String(error);
    } catch {
      return "unprintable error";
    }
  };

  const warnSafely = (source: string, error: unknown): void => {
    try {
      ctx.logger.warn(
        `sandbox-escalation-fix: skipped incompatible ${source}: ${errorText(error)}`,
      );
    } catch {
      // Runtime compatibility events must never veto tool or agent registration.
    }
  };

  const scanSafely = (
    source: string,
    selectAgents: () => readonly (Agent | undefined)[],
    pruneInvisible: boolean,
  ): void => {
    let agents: readonly (Agent | undefined)[];
    try {
      agents = selectAgents();
    } catch (error) {
      warnSafely(`${source} scope scan`, error);
      return;
    }

    const visible = new Set<ToolDefinition>();
    let complete = true;
    for (const agent of agents) {
      const lookup = lookupVisible(agent, {
        schemas: (error) => {
          warnSafely(`${source} schemas lookup`, error);
        },
        get: (toolName, error) => {
          warnSafely(`${source} tool "${toolName}" lookup`, error);
        },
      });
      if (!lookup.complete) complete = false;
      for (const definition of lookup.definitions) visible.add(definition);
    }

    for (const definition of visible) {
      if (
        patches.has(definition)
        || incompatible.has(definition)
        || nonEscalating.has(definition)
      ) continue;
      try {
        const patch = patchToolDefinition(definition, resolveMode);
        if (patch !== undefined) {
          patches.set(definition, patch);
        } else if (hasStaticParameters(definition)) {
          nonEscalating.add(definition);
        }
      } catch (error) {
        incompatible.add(definition);
        warnSafely(`${source} target definition`, error);
      }
    }

    if (!pruneInvisible || !complete) return;
    for (const [definition, patch] of [...patches]) {
      if (visible.has(definition)) continue;
      patches.delete(definition);
      patch.restore();
    }
  };

  ctx.effect(() => {
    let stopChange: (() => void) | undefined;
    let stopCreated: (() => void) | undefined;
    let stopDisposed: (() => void) | undefined;
    let restoreSetExecutor: (() => void) | undefined;
    try {
      scanAll();
      const rawTools = ctx.tools as unknown;
      if (isRecord(rawTools) && typeof rawTools.setExecutor === "function") {
        const origSetExecutor = rawTools.setExecutor as (...args: unknown[]) => unknown;
        const wrappedSetExecutor = function (this: unknown, ...args: unknown[]): unknown {
          const handle = origSetExecutor.apply(this === rawTools ? ctx.tools : this, args);
          scanSafely("executor change", () => [undefined, ...ctx.agents.list()], true);
          if (typeof handle === "function") {
            return () => {
              try {
                return (handle as () => unknown)();
              } finally {
                scanSafely("executor dispose", () => [undefined, ...ctx.agents.list()], true);
              }
            };
          }
          if (isRecord(handle) && typeof handle.dispose === "function") {
            const origDispose = handle.dispose as (...disposeArgs: unknown[]) => unknown;
            try {
              handle.dispose = function (this: unknown, ...disposeArgs: unknown[]): unknown {
                try {
                  return origDispose.apply(this, disposeArgs);
                } finally {
                  scanSafely("executor dispose", () => [undefined, ...ctx.agents.list()], true);
                }
              };
            } catch {
              // Ignore non-writable dispose on effect handles.
            }
          }
          return handle;
        };
        try {
          rawTools.setExecutor = wrappedSetExecutor;
          restoreSetExecutor = () => {
            if (rawTools.setExecutor === wrappedSetExecutor) {
              rawTools.setExecutor = origSetExecutor;
            }
          };
        } catch {
          // Ignore non-writable setExecutor on frozen/custom tool registries.
        }
      }
      stopChange = ctx.on("tools/change", () => {
        scanSafely("runtime", () => [undefined, ...ctx.agents.list()], true);
        return undefined;
      });
      stopCreated = ctx.on("agent/created", ({ agent }) => {
        scanSafely("new agent", () => [agent], false);
        return undefined;
      });
      stopDisposed = ctx.on("agent/disposed", () => {
        scanSafely("agent disposal", () => [undefined, ...ctx.agents.list()], true);
        return undefined;
      });
    } catch (error) {
      restoreSetExecutor?.();
      stopDisposed?.();
      stopCreated?.();
      stopChange?.();
      restoreAll();
      throw error;
    }

    return () => {
      restoreSetExecutor?.();
      stopDisposed?.();
      stopCreated?.();
      stopChange?.();
      restoreAll();
    };
  }, "sandbox-escalation-fix.lifecycle()");
}
