import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";

const require = createRequire(import.meta.url);
const model = require("./model.cjs");

export const name = "dsh-prompts";
export const inject = ["configEditor", "connection", "storageDomain"];

/** Empty schema: state is persisted in storageDomain rather than cordis.patch.yml. */
export const Config = z.object({});

export const STATE_PATH = "/api/dsh-prompts/state";
export const ACTION_PATH = "/api/dsh-prompts/action";

const RECORD_ID = "prompts-config";

const stateRecordSchema = {
  parse(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("invalid prompts state record");
    }
    return model.normalizeState(raw);
  },
};

export function promptsDomain(profilePath) {
  const hash = createHash("sha256")
    .update(resolve(String(profilePath || "default")))
    .digest("hex")
    .slice(0, 16);
  return {
    name: "dsh_prompts_" + hash,
    version: 1,
    layout: "per-record",
    invalidRecords: "backup-and-skip",
    tables: {
      state: { valueSchema: stateRecordSchema },
    },
  };
}

function profileDir(ctx) {
  const docPath = ctx?.configEditor?.documentPath;
  return typeof docPath === "string" && docPath.trim() ? dirname(docPath) : process.cwd();
}

function workspaceSource(ctx) {
  let controller;
  let registry;
  if (typeof ctx?.inject === "function") {
    ctx.inject(["workspaceRegistry"], (inner) => {
      registry = inner.workspaceRegistry;
      return () => {
        registry = undefined;
      };
    });
    ctx.inject(["workspaceController"], (inner) => {
      controller = inner.workspaceController;
      return () => {
        controller = undefined;
      };
    });
  }
  return async () => {
    const reg = registry;
    if (reg && typeof reg.list === "function") {
      try {
        return (reg.list() || []).map((item) => ({
          workspaceId: item.id ?? item.workspaceId ?? "",
          title: item.title || "",
          path: model.normalizePath(item.path || ""),
          sessionIds: Array.isArray(item.sessionIds) ? [...item.sessionIds] : [],
        }));
      } catch {
        // Fall through to workspaceController.
      }
    }
    const ctrl = controller;
    if (!ctrl || typeof ctrl.follow !== "function") return [];
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 3000);
    try {
      for await (const frame of ctrl.follow(abort.signal)) {
        if (frame?.type === "baseline") {
          return (frame.value?.items || []).map((item) => ({
            workspaceId: item.workspaceId || item.id || "",
            title: item.title || "",
            path: model.normalizePath(item.path || ""),
            sessionIds: Array.isArray(item.sessionIds) ? [...item.sessionIds] : [],
          }));
        }
        break;
      }
      return [];
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  };
}

function resolveDirectSessionCwd(workingDirService, session) {
  if (!session) return "";
  const wd = workingDirService;
  if (wd && typeof wd.get === "function") {
    try {
      const resolved = wd.get(session);
      if (typeof resolved === "string" && resolved.trim()) {
        return model.normalizePath(resolved);
      }
    } catch {
      // Fall back to session header.
    }
  }
  const headerCwd = session?.header?.cwd ?? session?.cwd ?? "";
  return typeof headerCwd === "string" ? model.normalizePath(headerCwd) : "";
}

function resolveSessionCwd(workingDirService, session, agentsService) {
  const direct = resolveDirectSessionCwd(workingDirService, session);
  if (direct) return direct;
  // Subagent lineage fallback: walk parentSession up through live AgentRegistry if child cwd is not yet populated
  if (!agentsService || typeof agentsService.get !== "function") return "";
  const visited = new Set();
  if (session?.id) visited.add(session.id);
  let parentId = session?.header?.parentSession;
  while (typeof parentId === "string" && parentId && !visited.has(parentId)) {
    visited.add(parentId);
    let parentAgent;
    try {
      parentAgent = agentsService.get(parentId);
    } catch {
      break;
    }
    const parentSession = parentAgent?.session;
    if (!parentSession) break;
    const parentCwd = resolveDirectSessionCwd(workingDirService, parentSession);
    if (parentCwd) return parentCwd;
    parentId = parentSession?.header?.parentSession;
  }
  return "";
}

function jsonResponse(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function isCrossSiteRequest(request) {
  const site = request?.headers?.get?.("sec-fetch-site");
  return typeof site === "string" && site.toLowerCase() === "cross-site";
}

export async function apply(ctx) {
  if (typeof ctx?.inject === "function") {
    ctx.inject(["settings"], (scope) => {
      if (typeof scope?.settings?.configure === "function") {
        scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
      }
    });
  }

  let workingDirService;
  let agentsService;
  if (typeof ctx?.inject === "function") {
    ctx.inject(["workingDirectory"], (scope) => {
      workingDirService = scope.workingDirectory;
      return () => {
        workingDirService = undefined;
      };
    });
    ctx.inject(["agents"], (scope) => {
      agentsService = scope.agents;
      return () => {
        agentsService = undefined;
      };
    });
  }

  const listWorkspaces = workspaceSource(ctx);
  const tracker = model.createSessionPromptTracker();
  let closing = false;
  let domain = null;
  let table = null;
  let currentState = model.defaultState();
  let queue = Promise.resolve();

  ctx.effect(() => async () => {
    closing = true;
    if (domain && typeof domain.close === "function") {
      await domain.close();
    }
  }, "dsh-prompts: storage domain lifecycle");

  if (ctx?.storageDomain && typeof ctx.storageDomain.open === "function") {
    domain = await ctx.storageDomain.open(promptsDomain(profileDir(ctx)));
    if (closing) {
      await domain.close();
      return;
    }
    table = domain.tables.get("state");
    const persisted = table?.get(RECORD_ID);
    if (persisted) {
      currentState = model.normalizeState(persisted);
    }
  }

  const persistState = async (nextState) => {
    const prevSig = model.effectivePromptSignature(currentState);
    currentState = model.normalizeState(nextState);
    const nextSig = model.effectivePromptSignature(currentState);
    if (table && typeof table.put === "function") {
      await table.put(RECORD_ID, currentState);
    }
    if (prevSig !== nextSig) {
      try {
        ctx.emit?.("system-prompt/change");
      } catch {
        // Ignore if event bus does not declare system-prompt/change in isolated tests.
      }
    }
    return currentState;
  };

  const registerPromptSections = (spService) => {
    if (!spService || typeof spService.section !== "function") return () => {};
    const disposePrefix = spService.section({
      name: model.PREFIX_SECTION_NAME,
      order: model.PREFIX_ORDER,
      interpolate: false,
      text: (assembleCtx) => {
        const session = assembleCtx?.agent?.session ?? assembleCtx?.session ?? null;
        const cwd =
          resolveSessionCwd(workingDirService, session, agentsService) ||
          model.normalizePath(assembleCtx?.cwd || "");
        const isSubagent = model.isSubagentContext(assembleCtx, session);
        return tracker.resolveSlotText(currentState, {
          sessionId: session?.id || assembleCtx?.sessionId || "",
          session,
          cwd,
          slot: "prefix",
          isSubagent,
        });
      },
    });
    const disposeSuffix = spService.section({
      name: model.SUFFIX_SECTION_NAME,
      order: model.SUFFIX_ORDER,
      interpolate: false,
      text: (assembleCtx) => {
        const session = assembleCtx?.agent?.session ?? assembleCtx?.session ?? null;
        const cwd =
          resolveSessionCwd(workingDirService, session, agentsService) ||
          model.normalizePath(assembleCtx?.cwd || "");
        const isSubagent = model.isSubagentContext(assembleCtx, session);
        return tracker.resolveSlotText(currentState, {
          sessionId: session?.id || assembleCtx?.sessionId || "",
          session,
          cwd,
          slot: "suffix",
          isSubagent,
        });
      },
    });
    return () => {
      try {
        if (typeof disposePrefix === "function") disposePrefix();
      } catch {
        // Ignore teardown error.
      }
      try {
        if (typeof disposeSuffix === "function") disposeSuffix();
      } catch {
        // Ignore teardown error.
      }
    };
  };

  if (typeof ctx?.inject === "function") {
    ctx.inject(["systemPrompt"], (scope) => {
      scope.effect(() => registerPromptSections(scope.systemPrompt), "dsh-prompts: systemPrompt sections");
    });
  }

  const buildPayload = async () => {
    const workspaces = await listWorkspaces();
    return {
      state: currentState,
      workspaces,
      summary: model.summaryCounts(currentState),
    };
  };

  if (ctx?.connection?.fetch && typeof ctx.connection.fetch.register === "function") {
    ctx.effect(() => ctx.connection.fetch.register({
      path: STATE_PATH,
      methods: ["GET"],
      requestBody: "buffered",
      fetch: async (request) => {
        if (isCrossSiteRequest(request)) {
          return jsonResponse({ ok: false, code: "forbidden" }, 403);
        }
        try {
          await queue.catch(() => {});
          return jsonResponse({ ok: true, ...(await buildPayload()) });
        } catch (error) {
          return jsonResponse(
            { ok: false, code: "internalError", message: String(error?.message || error) },
            500
          );
        }
      },
    }), "dsh-prompts: state route");

    ctx.effect(() => ctx.connection.fetch.register({
      path: ACTION_PATH,
      methods: ["POST"],
      requestBody: "buffered",
      fetch: async (request) => {
        if (isCrossSiteRequest(request)) {
          return jsonResponse({ ok: false, code: "forbidden" }, 403);
        }
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ ok: false, code: "badRequest" }, 400);
        }
        const run = queue.then(async () => {
          if (closing) throw new Error("closing");
          const nextState = model.applyMutation(currentState, body);
          await persistState(nextState);
          return buildPayload();
        });
        queue = run.catch(() => {});
        try {
          const payload = await run;
          return jsonResponse({ ok: true, ...payload });
        } catch (error) {
          const code = String(error?.message || "badRequest");
          const isClientError = [
            "badRequest",
            "titleRequired",
            "contentRequired",
            "workspaceRequired",
            "limitReached",
            "unknownOp",
          ].includes(code);
          let fallback = null;
          try {
            fallback = await buildPayload();
          } catch {
            // Ignore secondary error.
          }
          return jsonResponse(
            {
              ok: false,
              code: isClientError ? code : "internalError",
              message: String(error?.message || error),
              ...(fallback || {}),
            },
            isClientError ? 400 : 500
          );
        }
      },
    }), "dsh-prompts: action route");
  }
}
