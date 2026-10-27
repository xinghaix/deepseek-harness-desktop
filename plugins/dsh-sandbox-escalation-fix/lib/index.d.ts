import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { SandboxMode } from "@deepseek-ai/dsh-sandbox";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";
export declare const name = "sandbox-escalation-fix";
export declare const inject: string[];
/**
 * Built-in DSH tools and common host-compatible shell extensions (`dsh-ops`)
 * that advertise sandbox escalation (`sandbox_permissions` + `justification`).
 * `schemas()` may add other first-party or plugin tools exposing the same pair.
 */
export declare const KNOWN_ESCALATION_TOOL_NAMES: readonly ["bash", "pwsh", "write", "edit", "run_code", "ops_bash"];
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
export declare function exposesSandboxEscalation(definition: ToolDefinition): boolean;
/**
 * Drop a sandbox escalation that is not strictly wider than the session's
 * current mode, strip null/blank escalation placeholders or orphan reasons,
 * and fill a fallback reason when a genuinely wider request omits one.
 */
export declare function normalizeSandboxEscalation(args: unknown, currentMode: SandboxMode): unknown;
export declare function patchToolDefinition(definition: ToolDefinition, resolveMode: ModeResolver): ToolDefinitionPatch | undefined;
export declare function collectCandidateToolNames(tools: ToolLookup, agent: Agent | undefined, onSchemasError?: (error: unknown) => void): string[];
export declare function apply(ctx: Context): void;
export {};
//# sourceMappingURL=index.d.ts.map