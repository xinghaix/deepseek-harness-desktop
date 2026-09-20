export const name = "sandbox-escalation-fix";
export const inject = ["agents", "tools", "sandboxPolicy"];
/**
 * Built-in DSH tools that advertise sandbox escalation on 0.1.6.
 * PTC / `run_code` existed earlier (Code Mode in 0.1.0-rc.6); the outer
 * `run_code` tool only gained these fields in 0.1.6. `schemas()` may add
 * more later first-party or plugin tools that expose the same pair.
 */
export const KNOWN_ESCALATION_TOOL_NAMES = [
    "bash",
    "pwsh",
    "write",
    "edit",
    "run_code",
];
const SANDBOX_MODE_RANK = {
    "read-only": 0,
    "workspace-write": 1,
    "danger-full-access": 2,
};
const EMPTY_JUSTIFICATION = "Empty justification";
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isToolName(value) {
    return typeof value === "string" && value.length > 0;
}
export function exposesSandboxEscalation(definition) {
    if (!isRecord(definition.parameters))
        return false;
    const properties = definition.parameters.properties;
    return isRecord(properties)
        && Object.hasOwn(properties, "sandbox_permissions")
        && Object.hasOwn(properties, "justification");
}
/**
 * Drop a sandbox escalation that is not strictly wider than the session's
 * current mode. DSH rejects same-mode and narrower requests with
 * "not strictly wider"; those calls should run under the standing policy.
 */
export function normalizeSandboxEscalation(args, currentMode) {
    if (!isRecord(args))
        return args;
    const requestedMode = args.sandbox_permissions;
    if (requestedMode === undefined) {
        if (!Object.hasOwn(args, "justification"))
            return args;
        const normalized = { ...args };
        delete normalized.justification;
        return normalized;
    }
    if (requestedMode !== "workspace-write"
        && requestedMode !== "danger-full-access")
        return args;
    if (SANDBOX_MODE_RANK[requestedMode] <= SANDBOX_MODE_RANK[currentMode]) {
        const normalized = { ...args };
        delete normalized.sandbox_permissions;
        delete normalized.justification;
        return normalized;
    }
    if (args.justification === undefined
        || (typeof args.justification === "string" && args.justification.trim() === "")) {
        return { ...args, justification: EMPTY_JUSTIFICATION };
    }
    return args;
}
export function patchToolDefinition(definition, resolveMode) {
    if (!exposesSandboxEscalation(definition))
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(definition, "execute");
    if (descriptor === undefined || !("value" in descriptor) || descriptor.writable !== true) {
        throw new Error(`sandbox-escalation-fix: tool "${definition.name}" execute is not a writable own property`);
    }
    const mutable = definition;
    const original = definition.execute;
    let active = true;
    const wrapped = async function (args, exec) {
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
    }
    catch (error) {
        active = false;
        try {
            if (definition.execute === wrapped)
                mutable.execute = original;
        }
        catch {
            // Preserve the first installation failure.
        }
        throw new Error(`sandbox-escalation-fix: failed to wrap tool "${definition.name}" execute`, { cause: error });
    }
    return {
        definition,
        restore() {
            active = false;
            try {
                if (definition.execute === wrapped)
                    mutable.execute = original;
            }
            catch {
                // The inactive wrapper is a safe pass-through if another owner froze it.
            }
        },
    };
}
export function collectCandidateToolNames(tools, agent, onSchemasError) {
    const names = new Set(KNOWN_ESCALATION_TOOL_NAMES);
    if (typeof tools.schemas !== "function")
        return [...names];
    try {
        const schemas = tools.schemas(agent);
        if (!Array.isArray(schemas))
            return [...names];
        for (const schema of schemas) {
            if (isRecord(schema) && isToolName(schema.name))
                names.add(schema.name);
        }
    }
    catch (error) {
        onSchemasError?.(error);
    }
    return [...names];
}
export function apply(ctx) {
    const patches = new Map();
    const incompatible = new WeakSet();
    const resolveMode = (exec) => ctx.sandboxPolicy.resolve(exec.agent === undefined ? undefined : { session: exec.agent.session }).mode;
    const restore = (selected) => {
        for (const patch of [...selected].reverse()) {
            patches.delete(patch.definition);
            patch.restore();
        }
    };
    const restoreAll = () => {
        const activePatches = [...patches.values()];
        patches.clear();
        for (const patch of activePatches.reverse())
            patch.restore();
    };
    const lookupVisible = (agent, onError) => {
        let complete = true;
        const names = collectCandidateToolNames(ctx.tools, agent, (error) => {
            complete = false;
            onError?.schemas?.(error);
        });
        const definitions = [];
        for (const toolName of names) {
            try {
                const definition = ctx.tools.get(toolName, agent);
                if (definition !== undefined)
                    definitions.push(definition);
            }
            catch (error) {
                complete = false;
                if (onError?.get === undefined)
                    throw error;
                onError.get(toolName, error);
            }
        }
        return { definitions, complete };
    };
    const patchVisibleTools = (agent, added) => {
        for (const definition of lookupVisible(agent).definitions) {
            if (patches.has(definition))
                continue;
            const patch = patchToolDefinition(definition, resolveMode);
            if (patch === undefined)
                continue;
            patches.set(definition, patch);
            added.push(patch);
        }
    };
    const scanTransaction = (agents) => {
        const added = [];
        try {
            for (const agent of agents)
                patchVisibleTools(agent, added);
        }
        catch (error) {
            restore(added);
            throw error;
        }
    };
    const scanAll = () => {
        scanTransaction([undefined, ...ctx.agents.list()]);
    };
    const errorText = (error) => {
        try {
            return error instanceof Error ? error.message : String(error);
        }
        catch {
            return "unprintable error";
        }
    };
    const warnSafely = (source, error) => {
        try {
            ctx.logger.warn(`sandbox-escalation-fix: skipped incompatible ${source}: ${errorText(error)}`);
        }
        catch {
            // Runtime compatibility events must never veto tool or agent registration.
        }
    };
    const scanSafely = (source, selectAgents, pruneInvisible) => {
        let agents;
        try {
            agents = selectAgents();
        }
        catch (error) {
            warnSafely(`${source} scope scan`, error);
            return;
        }
        const visible = new Set();
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
            if (!lookup.complete)
                complete = false;
            for (const definition of lookup.definitions)
                visible.add(definition);
        }
        for (const definition of visible) {
            if (patches.has(definition) || incompatible.has(definition))
                continue;
            try {
                const patch = patchToolDefinition(definition, resolveMode);
                if (patch !== undefined)
                    patches.set(definition, patch);
            }
            catch (error) {
                incompatible.add(definition);
                warnSafely(`${source} target definition`, error);
            }
        }
        if (!pruneInvisible || !complete)
            return;
        for (const [definition, patch] of [...patches]) {
            if (visible.has(definition))
                continue;
            patches.delete(definition);
            patch.restore();
        }
    };
    ctx.effect(() => {
        let stopChange;
        let stopCreated;
        let stopDisposed;
        try {
            scanAll();
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
        }
        catch (error) {
            stopDisposed?.();
            stopCreated?.();
            stopChange?.();
            restoreAll();
            throw error;
        }
        return () => {
            stopDisposed?.();
            stopCreated?.();
            stopChange?.();
            restoreAll();
        };
    }, "sandbox-escalation-fix.lifecycle()");
}
//# sourceMappingURL=index.js.map