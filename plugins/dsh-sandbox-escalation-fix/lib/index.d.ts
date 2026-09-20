import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SandboxMode } from "@deepseek-ai/dsh-sandbox";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
export declare const name = "sandbox-escalation-fix";
export declare const inject: string[];
/**
 * Built-in DSH tools that advertise sandbox escalation on 0.1.6.
 * PTC / `run_code` existed earlier (Code Mode in 0.1.0-rc.6); the outer
 * `run_code` tool only gained these fields in 0.1.6. `schemas()` may add
 * more later first-party or plugin tools that expose the same pair.
 */
export declare const KNOWN_ESCALATION_TOOL_NAMES: readonly ["bash", "pwsh", "write", "edit", "run_code"];
type ModeResolver = (exec: ToolRunContext) => SandboxMode;
type ToolLookup = {
    get(name: string, scope?: unknown): ToolDefinition | undefined;
    schemas?(scope?: unknown): ReadonlyArray<{
        readonly name?: unknown;
    }>;
};
export interface ToolDefinitionPatch {
    readonly definition: ToolDefinition;
    restore(): void;
}
export declare function exposesSandboxEscalation(definition: ToolDefinition): boolean;
/**
 * Drop a sandbox escalation that is not strictly wider than the session's
 * current mode. DSH rejects same-mode and narrower requests with
 * "not strictly wider"; those calls should run under the standing policy.
 */
export declare function normalizeSandboxEscalation(args: unknown, currentMode: SandboxMode): unknown;
export declare function patchToolDefinition(definition: ToolDefinition, resolveMode: ModeResolver): ToolDefinitionPatch | undefined;
export declare function collectCandidateToolNames(tools: ToolLookup, agent: Agent | undefined, onSchemasError?: (error: unknown) => void): string[];
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map