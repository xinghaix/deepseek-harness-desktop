import { SettingsStore } from "./store.js";
import { SettingsError } from "./model.js";

export const name = "dsh-hindsight-settings";
export const inject = ["connection", "workspaceRegistry", "tools"];
export const STATE_PATH = "/api/dsh-hindsight-settings/state";
export const SAVE_PATH = "/api/dsh-hindsight-settings/save";

const response = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const statuses = { forbidden: 403, badRequest: 400, confirmShared: 400, conflict: 409, configBusy: 409, repositoryOverridden: 409, workspaceMissing: 404 };
function errorResponse(error) {
  const code = error instanceof SettingsError ? error.code : "internalError";
  return response({ ok: false, code }, statuses[code] || 500);
}
function ownerRequest(ctx, request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const admission = ctx.connection.admit(request);
  return !admission.rejection && admission.peer.principal.kind === "owner";
}
export function apply(ctx) {
  const store = new SettingsStore({ listWorkspaces: () => ctx.workspaceRegistry.list() });
  ctx.effect(() => () => store.close());
  ctx.inject(["settings"], scope => scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber)));
  const readStatus = async workspaceId => ({
    ...await store.status(workspaceId),
    // 工具是否注册不是“正在运行”的证据；不伪装成 Hindsight 内部缓存的实时状态。
    memoryToolsRegistered: Boolean(ctx.tools.get("hindsight_diagnose")),
  });
  ctx.effect(() => ctx.connection.fetch.register({
    path: STATE_PATH, methods: ["GET"], requestBody: "buffered",
    async fetch(request) {
      if (!ownerRequest(ctx, request)) return response({ ok: false, code: "forbidden" }, 403);
      try {
        const workspaceId = new URL(request.url).searchParams.get("workspaceId") || undefined;
        return response({ ok: true, status: await readStatus(workspaceId) });
      } catch (error) { return errorResponse(error); }
    },
  }));
  ctx.effect(() => ctx.connection.fetch.register({
    path: SAVE_PATH, methods: ["POST"], requestBody: "buffered",
    async fetch(request) {
      if (!ownerRequest(ctx, request)) return response({ ok: false, code: "forbidden" }, 403);
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return response({ ok: false, code: "badRequest" }, 400);
      try {
        const body = await request.text();
        if (body.length > 8192) throw new SettingsError("badRequest");
        let input;
        try { input = JSON.parse(body); } catch { throw new SettingsError("badRequest"); }
        const result = await store.save(input);
        if (result.status) result.status.memoryToolsRegistered = Boolean(ctx.tools.get("hindsight_diagnose"));
        return response({ ok: true, ...result });
      } catch (error) { return errorResponse(error); }
    },
  }));
  // 读取面向模型开放；记忆收集授权的修改只保留在用户设置界面。
  ctx.effect(() => ctx.tools.register({
    name: "hindsight_settings_status",
    description: "读取 Hindsight 的 DSH 开关、仓库策略和重启提示；不读取记忆内容或凭据。修改记忆授权请使用设置 → Hindsight 记忆。",
    parameters: { type: "object", properties: { workspaceId: { type: "string", description: "工作区 ID；省略时仅返回总开关与可选工作区列表。" } }, additionalProperties: false },
    output: { schema: { type: "object" }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }] },
    async execute(args) { return readStatus(args?.workspaceId); },
  }));
}
