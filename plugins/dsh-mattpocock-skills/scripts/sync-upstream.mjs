#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const ASSETS_DIR = join(PLUGIN_ROOT, "assets");
const BUCKETS = ["engineering", "productivity", "in-progress", "misc"];

/**
 * 17 Surgical DSH Patches (idempotent, zero em-dashes, preserving all Leading Words).
 */
export const SURGICAL_PATCHES = [
  {
    id: "P01-grill-me-skill-tool",
    file: "productivity/grill-me/SKILL.md",
    before: `Call the Skill tool with "grilling".`,
    after: `Call the \`skill\` tool with \`"grilling"\`.`,
  },
  {
    id: "P02-grilling-subagent",
    file: "productivity/grilling/SKILL.md",
    before: `dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself.`,
    after: `dispatch a sub-agent (via \`subagent\`, or look it up directly if sub-agent delegation depth is 0) to find it; don't ask the user for anything you could look up yourself.`,
  },
  {
    id: "P03-writing-for-agents-skill-mechanics",
    file: "productivity/writing-for-agents/SKILL-MECHANICS.md",
    before: `It can only hint, never fire them: user-invoked skills have no description, so nothing but the human can reach them.`,
    after: `It can only hint, never fire them: user-invoked skills have no description, so nothing but the human can reach them. In DSH, skills live under \`.dsh/skills/\`, \`.agents/skills/\`, \`~/.dsh/skills/\`, or bundled skill providers, and model-invocable skills are loaded with the \`skill\` tool.`,
  },
  {
    id: "P04-grill-with-docs-skill-tool",
    file: "engineering/grill-with-docs/SKILL.md",
    before: `Call the Skill tool twice, for "grilling" and "domain-modeling".`,
    after: `Call the \`skill\` tool twice, for \`"grilling"\` and \`"domain-modeling"\`.`,
  },
  {
    id: "P05-implement-skill-tool",
    file: "engineering/implement/SKILL.md",
    before: `Call the Skill tool with "tdd" where possible, at pre-agreed seams.\n\nRun typechecking regularly, single test files regularly, and the full test suite once at the end.\n\nOnce done, call the Skill tool with "code-review" to review the work.`,
    after: `Call the \`skill\` tool with \`"tdd"\` where possible, at pre-agreed seams.\n\nRun typechecking regularly, single test files regularly, and the full test suite once at the end.\n\nOnce done, call the \`skill\` tool with \`"code-review"\` to review the work.`,
  },
  {
    id: "P06-implement-spec-skill-and-worktree",
    file: "engineering/implement-spec/SKILL.md",
    before: `**Implementer subagents** should be run in the background where possible for maximum concurrency.`,
    after: `**Implementer subagents** should be run in the background where possible for maximum concurrency (via \`subagent\`, \`create_worktree\`, or \`spawn_teammate\`; if sub-agent delegation depth is 0 in the current session, execute ready frontier tickets sequentially in topological order).`,
  },
  {
    id: "P06b-implement-spec-skill-tool-calls",
    file: "engineering/implement-spec/SKILL.md",
    before: `   - calls the Skill tool with \`tdd\` to build the ticket;\n   - merges the integration branch tip into its own branch before reporting done\n\n5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**.\n\n6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.\n\n7. Once all tickets are complete, call the Skill tool with \`code-review\` on the integration branch.`,
    after: `   - calls the \`skill\` tool with \`tdd\` to build the ticket;\n   - merges the integration branch tip into its own branch before reporting done\n\n5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**.\n\n6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.\n\n7. Once all tickets are complete, call the \`skill\` tool with \`code-review\` on the integration branch.`,
  },
  {
    id: "P07-code-review-parallel-subagents",
    file: "engineering/code-review/SKILL.md",
    before: `Issue both sub-agent calls together, in the foreground, and aggregate the reports they return.`,
    after: `Issue both sub-agent calls together via \`subagent\`, in the foreground (or if sub-agent delegation depth is 0, run the two passes sequentially in isolation), and aggregate the reports they return.`,
  },
  {
    id: "P08-design-it-twice-subagents",
    file: "engineering/codebase-design/DESIGN-IT-TWICE.md",
    before: `Spawn 3+ sub-agents in parallel. Each must produce a **radically different** interface for the deepened module.`,
    after: `Spawn 3+ sub-agents in parallel via \`subagent\` (or if sub-agent delegation depth is 0, design the 3+ radically different interfaces side by side in independent sections). Each must produce a **radically different** interface for the deepened module.`,
  },
  {
    id: "P09-improve-codebase-architecture-skill-and-present",
    file: "engineering/improve-codebase-architecture/SKILL.md",
    before: `- Call the Skill tool with "codebase-design" for the architecture vocabulary`,
    after: `- Call the \`skill\` tool with \`"codebase-design"\` for the architecture vocabulary`,
  },
  {
    id: "P09b-improve-codebase-architecture-html-and-grilling",
    file: "engineering/improve-codebase-architecture/SKILL.md",
    before: `Open it for the user (\`xdg-open <path>\` on Linux, \`open <path>\` on macOS, \`start <path>\` on Windows) and tell them the absolute path.`,
    after: `Open it for the user (\`xdg-open <path>\` on Linux, \`open <path>\` on macOS, \`start <path>\` on Windows, and call \`present\` on the HTML file if available) and tell them the absolute path.`,
  },
  {
    id: "P09c-improve-codebase-architecture-grilling-calls",
    file: "engineering/improve-codebase-architecture/SKILL.md",
    before: `Once the user picks a candidate, call the Skill tool with "grilling" to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.\n\nSide effects happen inline as decisions crystallize; call the Skill tool with "domain-modeling" to keep the domain model current as you go:`,
    after: `Once the user picks a candidate, call the \`skill\` tool with \`"grilling"\` to walk the decision tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.\n\nSide effects happen inline as decisions crystallize; call the \`skill\` tool with \`"domain-modeling"\` to keep the domain model current as you go:`,
  },
  {
    id: "P09d-improve-codebase-architecture-design-it-twice",
    file: "engineering/improve-codebase-architecture/SKILL.md",
    before: `Call the Skill tool with "codebase-design" and use its design-it-twice parallel sub-agent pattern.`,
    after: `Call the \`skill\` tool with \`"codebase-design"\` and use its design-it-twice parallel sub-agent pattern.`,
  },
  {
    id: "P10-prototype-logic-present",
    file: "engineering/prototype/LOGIC.md",
    before: `Send them the file, or open it for them.`,
    after: `Send them the file, or open it for them (and call \`present\` on the HTML file if available).`,
  },
  {
    id: "P11-triage-skill-tool",
    file: "engineering/triage/SKILL.md",
    before: `4. **Grill (if needed).** If the request needs fleshing out, call the Skill tool twice, for "grilling" and "domain-modeling", and grill it into shape a round of questions at a time, sharpening domain terms and updating \`GLOSSARY.md\`/ADRs inline as decisions land.`,
    after: `4. **Grill (if needed).** If the request needs fleshing out, call the \`skill\` tool twice, for \`"grilling"\` and \`"domain-modeling"\`, and grill it into shape a round of questions at a time, sharpening domain terms and updating \`GLOSSARY.md\`/ADRs inline as decisions land.`,
  },
  {
    id: "P12-wayfinder-skill-tool",
    file: "engineering/wayfinder/SKILL.md",
    before: `- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the Skill tool with "research". Use when knowledge outside the current working directory is required.\n- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the Skill tool with "prototype". Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.\n- **Grilling** (HITL): Conversation. The default case. Always call the Skill tool twice, for "grilling" and "domain-modeling".`,
    after: `- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a subagent that calls the \`skill\` tool with \`"research"\`. Use when knowledge outside the current working directory is required.\n- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) by calling the \`skill\` tool with \`"prototype"\`. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.\n- **Grilling** (HITL): Conversation. The default case. Always call the \`skill\` tool twice, for \`"grilling"\` and \`"domain-modeling"\`.`,
  },
  {
    id: "P12b-wayfinder-invocation-skill-tool",
    file: "engineering/wayfinder/SKILL.md",
    before: `1. **Name the destination.** Call the Skill tool twice, for "grilling" and "domain-modeling", to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.`,
    after: `1. **Name the destination.** Call the \`skill\` tool twice, for \`"grilling"\` and \`"domain-modeling"\`, to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.`,
  },
  {
    id: "P12c-wayfinder-work-skill-tool",
    file: "engineering/wayfinder/SKILL.md",
    before: `call the Skill tool for whichever skills the \`## Notes\` block names. If in doubt, call the Skill tool twice, for "grilling" and "domain-modeling".`,
    after: `call the \`skill\` tool for whichever skills the \`## Notes\` block names. If in doubt, call the \`skill\` tool twice, for \`"grilling"\` and \`"domain-modeling"\`.`,
  },
  {
    id: "P13-retro-skill-and-session-search",
    file: "engineering/retro/SKILL.md",
    before: `1. Call the Skill tool with \`writing-for-agents\` for the writing style guide.\n\n2. Read the primary sources for the session the user specifies. This may mean searching through session logs on this machine. If the user doesn't specify a session, default to the current one.`,
    after: `1. Call the \`skill\` tool with \`writing-for-agents\` for the writing style guide.\n\n2. Read the primary sources for the session the user specifies. This may mean searching through session logs on this machine (using \`session_search\`, \`session_event_search\`, and \`session_event_read\` when available). If the user doesn't specify a session, default to the current one.`,
  },
  {
    id: "P14-setup-matt-pocock-skills-paths",
    file: "engineering/setup-matt-pocock-skills/SKILL.md",
    before: `- Is the \`triage\` skill installed? (a \`triage\` skill folder alongside this one, or \`triage\` in your available skills.) This decides whether Section B runs at all.`,
    after: `- Is the \`triage\` skill installed? (check \`triage\` in your available skills, or look in \`.dsh/skills/\`, \`.agents/skills/\`, \`~/.dsh/skills/\`, \`.claude/skills/\`, or a \`triage\` skill folder alongside this one.) This decides whether Section B runs at all.`,
  },
  {
    id: "P15-ask-matt-sibling-paths-and-phase-boundaries",
    file: "engineering/ask-matt/SKILL.md",
    before: `Before stating what a skill does or recommending a step be skipped, read that skill's SKILL.md: the summaries here are for orientation only.`,
    after: `Before stating what a skill does or recommending a step be skipped, read that skill's SKILL.md (via file-read tools on sibling \`../<skill>/SKILL.md\` or \`../../{engineering,productivity,in-progress,misc}/<skill>/SKILL.md\` paths relative to this skill's base directory, or via the \`skill\` tool for model-invocable skills): the summaries here are for orientation only.`,
  },
  {
    id: "P15b-ask-matt-phase-boundaries-dsh",
    file: "engineering/ask-matt/PHASE-BOUNDARIES.md",
    before: `- swapping to a **new harness** (Claude → Codex),`,
    after: `- swapping to a **new harness** (Claude, DSH, or Codex),`,
  },
  {
    id: "P16-research-dsh-tools",
    file: "engineering/research/SKILL.md",
    before: `1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.`,
    after: `1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs; using \`research\`, \`domain_search\`, \`platform_search\`, \`web_search\`, \`web_fetch\`, and local file tools when available), not a secondary write-up of them. Follow every claim back to the source that owns it.`,
  },
  {
    id: "P17a-chief-of-staff-schedules-and-goals",
    file: "in-progress/chief-of-staff/SKILL.md",
    before: `Harness-permitting, you will suggest recurring schedules which can help in achieving the goal.`,
    after: `Harness-permitting (for example via \`create_goal\`, \`update_goal\`, and \`schedule_create\` in DSH), you will suggest recurring schedules which can help in achieving the goal.`,
  },
  {
    id: "P17b-claude-handoff-dsh-subagent",
    file: "in-progress/claude-handoff/SKILL.md",
    before: `Include a "suggested skills" section in the summary, naming which skills the next agent should call the Skill tool for.`,
    after: `In DSH, you may also hand off directly to a background agent or teammate via \`subagent\` or \`spawn_teammate\` seeded with the summary file.\n\nInclude a "suggested skills" section in the summary, naming which skills the next agent should call the \`skill\` tool for.`,
  },
  {
    id: "P17c-setup-ts-deep-modules-skill-tool",
    file: "in-progress/setup-ts-deep-modules/SKILL.md",
    before: `For the vocabulary (deep module, interface, seam, depth), call the Skill tool with "codebase-design" and use its language throughout.`,
    after: `For the vocabulary (deep module, interface, seam, depth), call the \`skill\` tool with \`"codebase-design"\` and use its language throughout.`,
  },
  {
    id: "P17d-git-guardrails-dsh-note",
    file: "misc/git-guardrails-claude-code/SKILL.md",
    before: `Ask the user: install for **this project only** (\`.claude/settings.json\`) or **all projects** (\`~/.claude/settings.json\`)?`,
    after: `Ask the user: install for **this project only** (\`.claude/settings.json\` or standard \`.git/hooks/pre-push\`) or **all projects** (\`~/.claude/settings.json\`)?`,
  },
];

function cleanCodexMetadata(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "agents") {
        rmSync(full, { recursive: true, force: true });
      } else {
        cleanCodexMetadata(full);
      }
    }
  }
}

export function applySurgicalPatches(assetsDir = ASSETS_DIR) {
  cleanCodexMetadata(assetsDir);
  for (const bucket of BUCKETS) {
    const readme = join(assetsDir, bucket, "README.md");
    if (existsSync(readme)) rmSync(readme, { force: true });
  }

  let appliedCount = 0;
  let alreadyPatchedCount = 0;

  for (const patch of SURGICAL_PATCHES) {
    const targetPath = join(assetsDir, patch.file);
    if (!existsSync(targetPath)) {
      throw new Error(`[sync-upstream] Missing target file for ${patch.id}: ${patch.file}`);
    }
    const content = readFileSync(targetPath, "utf8");
    if (content.includes(patch.after)) {
      alreadyPatchedCount++;
      continue;
    }
    if (!content.includes(patch.before)) {
      throw new Error(
        `[sync-upstream] Strict match assertion failed for ${patch.id} in ${patch.file}: expected snippet not found.`
      );
    }
    const updated = content.replace(patch.before, patch.after);
    if (updated.includes("\u2014")) {
      throw new Error(`[sync-upstream] Em-dash (U+2014) detected after applying ${patch.id} in ${patch.file}`);
    }
    writeFileSync(targetPath, updated, "utf8");
    appliedCount++;
  }

  return { appliedCount, alreadyPatchedCount, totalRules: SURGICAL_PATCHES.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const upstreamIdx = process.argv.indexOf("--upstream");
  if (upstreamIdx !== -1 && process.argv[upstreamIdx + 1]) {
    const upstreamSkillsDir = resolve(process.argv[upstreamIdx + 1], "skills");
    for (const bucket of BUCKETS) {
      const src = join(upstreamSkillsDir, bucket);
      const dst = join(ASSETS_DIR, bucket);
      if (statSync(src).isDirectory()) {
        rmSync(dst, { recursive: true, force: true });
        cpSync(src, dst, { recursive: true });
      }
    }
  }
  const result = applySurgicalPatches(ASSETS_DIR);
  console.log(
    `[sync-upstream] Success: applied=${result.appliedCount}, alreadyPatched=${result.alreadyPatchedCount}, totalRules=${result.totalRules}`
  );
}
