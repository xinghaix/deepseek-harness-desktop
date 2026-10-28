"use strict";

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 32768;
const MAX_ITEMS_PER_SCOPE = 64;

const PREFIX_ORDER = 100;
const SUFFIX_ORDER = 10150;
const PREFIX_SECTION_NAME = "dsh-prompts:prefix";
const SUFFIX_SECTION_NAME = "dsh-prompts:suffix";

const TEMPLATE_IDS = Object.freeze([
  "structured",
  "languageStyle",
  "codeQuality",
  "readOnlyDesign",
]);

function normalizePath(rawPath) {
  if (typeof rawPath !== "string") return "";
  let cleaned = rawPath.trim().replace(/\\/g, "/");
  if (!cleaned) return "";
  cleaned = cleaned.replace(/\/+/g, "/");
  if (/^[A-Za-z]:\/$/.test(cleaned) || cleaned === "/") return cleaned;
  return cleaned.replace(/\/+$/, "");
}

function pathKey(normalizedPath) {
  if (/^[A-Za-z]:(\/|$)/.test(normalizedPath)) {
    return normalizedPath.toLowerCase();
  }
  return normalizedPath;
}

function pathBaseName(rawPath) {
  const norm = normalizePath(rawPath);
  if (!norm) return "";
  if (norm === "/" || /^[A-Za-z]:\/$/.test(norm)) return norm;
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] || norm;
}

function isSameOrSubPath(childPath, parentPath) {
  const child = normalizePath(childPath);
  const parent = normalizePath(parentPath);
  if (!child || !parent) return false;
  const cKey = pathKey(child);
  const pKey = pathKey(parent);
  if (cKey === pKey) return true;
  const prefix = pKey.endsWith("/") ? pKey : pKey + "/";
  return cKey.startsWith(prefix);
}

function escapeXmlAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function generateId(now = Date.now()) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `prm_${Number(now).toString(36)}_${rand}`;
}

function normalizePosition(position) {
  return position === "prefix" ? "prefix" : "suffix";
}

function normalizeMergeMode(mode) {
  return mode === "override" ? "override" : "append";
}

function normalizeItem(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = String(raw.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
  const content = String(raw.content ?? "").trim().slice(0, MAX_CONTENT_LENGTH);
  if (!title || !content) return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 80) : generateId(now);
  return {
    id,
    title,
    content,
    includeTitle: raw.includeTitle !== false,
    enabled: raw.enabled !== false,
    position: normalizePosition(raw.position),
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : Number(now),
  };
}

function normalizeItemList(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (out.length >= MAX_ITEMS_PER_SCOPE) break;
    const item = normalizeItem(raw, now);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function normalizeWorkspaceProfile(raw, fallbackPath = "", now = Date.now()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const workspacePath = normalizePath(raw.workspacePath || fallbackPath);
  if (!workspacePath) return null;
  const workspaceTitle = String(raw.workspaceTitle || pathBaseName(workspacePath) || workspacePath)
    .trim()
    .slice(0, MAX_TITLE_LENGTH);
  const workspaceId = typeof raw.workspaceId === "string" ? raw.workspaceId.trim().slice(0, 120) : "";
  return {
    workspacePath,
    workspaceId,
    workspaceTitle,
    enabled: raw.enabled !== false,
    mergeMode: normalizeMergeMode(raw.mergeMode),
    items: normalizeItemList(raw.items, now),
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : Number(now),
  };
}

function defaultState() {
  return {
    version: 1,
    revision: 1,
    enabled: true,
    showInSettings: true,
    showInSidebar: false,
    globalItems: [],
    workspaces: {},
  };
}

function normalizeState(raw, now = Date.now()) {
  const base = defaultState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const workspaces = {};
  if (raw.workspaces && typeof raw.workspaces === "object" && !Array.isArray(raw.workspaces)) {
    for (const [key, value] of Object.entries(raw.workspaces)) {
      const profile = normalizeWorkspaceProfile(value, key, now);
      if (profile) {
        workspaces[profile.workspacePath] = profile;
      }
    }
  }
  return {
    version: 1,
    revision: Number.isInteger(raw.revision) && raw.revision >= 1 ? raw.revision : 1,
    enabled: raw.enabled !== false,
    showInSettings: raw.showInSettings !== false,
    showInSidebar: raw.showInSidebar === true,
    globalItems: normalizeItemList(raw.globalItems, now),
    workspaces,
  };
}

function findWorkspaceKey(workspacesMap, targetPath) {
  const norm = normalizePath(targetPath);
  if (!norm || !workspacesMap || typeof workspacesMap !== "object") return "";
  if (Object.prototype.hasOwnProperty.call(workspacesMap, norm)) return norm;
  const targetKey = pathKey(norm);
  for (const key of Object.keys(workspacesMap)) {
    if (pathKey(key) === targetKey) return key;
  }
  return norm;
}

function matchWorkspaceProfile(cwd, workspacesMap) {
  const normCwd = normalizePath(cwd);
  if (!normCwd || !workspacesMap || typeof workspacesMap !== "object") return null;
  let best = null;
  let bestLen = -1;
  for (const profile of Object.values(workspacesMap)) {
    if (!profile || typeof profile.workspacePath !== "string") continue;
    const wsPath = normalizePath(profile.workspacePath);
    if (!wsPath) continue;
    if (isSameOrSubPath(normCwd, wsPath)) {
      if (wsPath.length > bestLen) {
        best = profile;
        bestLen = wsPath.length;
      }
    }
  }
  return best;
}

function mergeWorkspaceCatalog(dshWorkspaces = [], workspacesMap = {}, currentCwd = "") {
  const catalog = [];
  const seenKeys = new Set();
  const normCurrentCwd = normalizePath(currentCwd);

  const buildEntry = (wsPath, wsId, wsTitle, sessionIds, inRegistry, profile) => {
    const items = profile?.items || [];
    const activeCount = profile?.enabled === false ? 0 : items.filter((item) => item.enabled !== false).length;
    const isCurrent = Boolean(normCurrentCwd && isSameOrSubPath(normCurrentCwd, wsPath));
    return {
      workspaceId: wsId || profile?.workspaceId || "",
      path: wsPath,
      title: wsTitle || profile?.workspaceTitle || pathBaseName(wsPath) || wsPath,
      sessionIds: Array.isArray(sessionIds) ? [...sessionIds] : [],
      inRegistry: Boolean(inRegistry),
      isCurrent,
      enabled: profile ? profile.enabled !== false : true,
      mergeMode: profile ? normalizeMergeMode(profile.mergeMode) : "append",
      configuredCount: items.length,
      activeCount,
      items,
    };
  };

  for (const ws of Array.isArray(dshWorkspaces) ? dshWorkspaces : []) {
    const wsPath = normalizePath(ws?.path);
    if (!wsPath) continue;
    const key = pathKey(wsPath);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const mapKey = findWorkspaceKey(workspacesMap, wsPath);
    const profile = workspacesMap?.[mapKey] || null;
    catalog.push(
      buildEntry(
        wsPath,
        ws.workspaceId || ws.id || "",
        ws.title || "",
        ws.sessionIds,
        true,
        profile
      )
    );
  }

  for (const profile of Object.values(workspacesMap || {})) {
    if (!profile || !profile.workspacePath) continue;
    const wsPath = normalizePath(profile.workspacePath);
    const key = pathKey(wsPath);
    if (!wsPath || seenKeys.has(key)) continue;
    seenKeys.add(key);
    catalog.push(buildEntry(wsPath, profile.workspaceId, profile.workspaceTitle, [], false, profile));
  }

  return catalog;
}

function mutateItemList(items, op, payload, now) {
  const list = [...items];
  switch (op) {
    case "upsert": {
      const title = String(payload?.title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
      const content = String(payload?.content ?? "").trim().slice(0, MAX_CONTENT_LENGTH);
      if (!title) throw new Error("titleRequired");
      if (!content) throw new Error("contentRequired");
      const position = normalizePosition(payload?.position);
      const enabled = payload?.enabled !== false;
      const existingIndex = typeof payload?.id === "string" && payload.id.trim()
        ? list.findIndex((item) => item.id === payload.id.trim())
        : -1;
      const includeTitle =
        payload?.includeTitle !== undefined
          ? payload.includeTitle !== false
          : existingIndex >= 0
            ? list[existingIndex].includeTitle !== false
            : true;
      if (existingIndex >= 0) {
        list[existingIndex] = {
          ...list[existingIndex],
          title,
          content,
          includeTitle,
          position,
          enabled,
          updatedAt: now,
        };
      } else {
        if (list.length >= MAX_ITEMS_PER_SCOPE) throw new Error("limitReached");
        list.push({
          id: typeof payload?.id === "string" && payload.id.trim() ? payload.id.trim() : generateId(now),
          title,
          content,
          includeTitle,
          position,
          enabled,
          updatedAt: now,
        });
      }
      return list;
    }
    case "delete": {
      const id = String(payload?.id ?? "").trim();
      return list.filter((item) => item.id !== id);
    }
    case "toggle": {
      const id = String(payload?.id ?? "").trim();
      return list.map((item) =>
        item.id === id
          ? {
              ...item,
              enabled: typeof payload?.enabled === "boolean" ? payload.enabled : !item.enabled,
              updatedAt: now,
            }
          : item
      );
    }
    case "move": {
      const id = String(payload?.id ?? "").trim();
      const delta = payload?.direction === "up" || payload?.direction === -1 ? -1 : 1;
      const index = list.findIndex((item) => item.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return list;
      const [moved] = list.splice(index, 1);
      list.splice(target, 0, moved);
      return list;
    }
    case "clear":
      return [];
    default:
      throw new Error("unknownOp");
  }
}

function applyMutation(currentState, action, now = Date.now()) {
  if (!action || typeof action !== "object") throw new Error("badRequest");
  const state = normalizeState(currentState, now);
  const type = String(action.type || "");

  const ensureWorkspace = (rawPath, extra = {}) => {
    const wsPath = normalizePath(rawPath);
    if (!wsPath) throw new Error("workspaceRequired");
    const key = findWorkspaceKey(state.workspaces, wsPath);
    const existing = state.workspaces[key];
    const profile = existing
      ? {
          ...existing,
          workspacePath: wsPath,
          workspaceId: typeof extra.workspaceId === "string" && extra.workspaceId.trim() ? extra.workspaceId.trim() : existing.workspaceId,
          workspaceTitle: typeof extra.workspaceTitle === "string" && extra.workspaceTitle.trim() ? extra.workspaceTitle.trim().slice(0, MAX_TITLE_LENGTH) : existing.workspaceTitle,
          updatedAt: now,
        }
      : {
          workspacePath: wsPath,
          workspaceId: typeof extra.workspaceId === "string" ? extra.workspaceId.trim() : "",
          workspaceTitle: String(extra.workspaceTitle || pathBaseName(wsPath) || wsPath).trim().slice(0, MAX_TITLE_LENGTH),
          enabled: true,
          mergeMode: "append",
          items: [],
          updatedAt: now,
        };
    return { key, wsPath, profile };
  };

  switch (type) {
    case "setOptions": {
      if (typeof action.enabled === "boolean") state.enabled = action.enabled;
      if (typeof action.showInSettings === "boolean") state.showInSettings = action.showInSettings;
      if (typeof action.showInSidebar === "boolean") state.showInSidebar = action.showInSidebar;
      state.revision += 1;
      return state;
    }
    case "upsertGlobalItem":
      state.globalItems = mutateItemList(state.globalItems, "upsert", action.item || action, now);
      state.revision += 1;
      return state;
    case "deleteGlobalItem":
      state.globalItems = mutateItemList(state.globalItems, "delete", action, now);
      state.revision += 1;
      return state;
    case "toggleGlobalItem":
      state.globalItems = mutateItemList(state.globalItems, "toggle", action, now);
      state.revision += 1;
      return state;
    case "moveGlobalItem":
      state.globalItems = mutateItemList(state.globalItems, "move", action, now);
      state.revision += 1;
      return state;
    case "clearGlobalItems":
      state.globalItems = [];
      state.revision += 1;
      return state;
    case "setWorkspacePolicy": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      if (typeof action.enabled === "boolean") profile.enabled = action.enabled;
      if (action.mergeMode !== undefined) profile.mergeMode = normalizeMergeMode(action.mergeMode);
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "upsertWorkspaceItem": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      profile.items = mutateItemList(profile.items, "upsert", action.item || action, now);
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "deleteWorkspaceItem": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      profile.items = mutateItemList(profile.items, "delete", action, now);
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "toggleWorkspaceItem": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      profile.items = mutateItemList(profile.items, "toggle", action, now);
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "moveWorkspaceItem": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      profile.items = mutateItemList(profile.items, "move", action, now);
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "clearWorkspaceItems": {
      const { key, wsPath, profile } = ensureWorkspace(action.workspacePath, action);
      profile.items = [];
      if (key !== wsPath) delete state.workspaces[key];
      state.workspaces[wsPath] = profile;
      state.revision += 1;
      return state;
    }
    case "deleteWorkspaceProfile": {
      const wsPath = normalizePath(action.workspacePath);
      if (!wsPath) throw new Error("workspaceRequired");
      const key = findWorkspaceKey(state.workspaces, wsPath);
      delete state.workspaces[key];
      delete state.workspaces[wsPath];
      state.revision += 1;
      return state;
    }
    default:
      throw new Error("badRequest");
  }
}

function resolveEffectiveItems(state, cwd = "", slot = "suffix") {
  const targetSlot = normalizePosition(slot);
  if (!state || state.enabled === false) {
    return {
      slot: targetSlot,
      active: false,
      revision: state?.revision || 1,
      mergeMode: "append",
      workspaceProfile: null,
      globalItems: [],
      workspaceItems: [],
    };
  }
  const matchedProfile = matchWorkspaceProfile(cwd, state.workspaces);
  const wsEnabled = Boolean(matchedProfile && matchedProfile.enabled !== false);
  const mergeMode = wsEnabled ? normalizeMergeMode(matchedProfile.mergeMode) : "append";
  const workspaceItems = wsEnabled
    ? (matchedProfile.items || []).filter((item) => item.enabled !== false && normalizePosition(item.position) === targetSlot)
    : [];
  const globalItems = mergeMode === "override"
    ? []
    : (state.globalItems || []).filter((item) => item.enabled !== false && normalizePosition(item.position) === targetSlot);

  return {
    slot: targetSlot,
    active: globalItems.length > 0 || workspaceItems.length > 0,
    revision: state.revision || 1,
    mergeMode,
    workspaceProfile: matchedProfile,
    globalItems,
    workspaceItems,
  };
}

function renderPriorityEnvelope(resolved, options = {}) {
  if (!resolved || !resolved.active) return "";
  const slot = normalizePosition(options.slot || resolved.slot);
  const revision = Number.isInteger(options.revision ?? resolved.revision) ? (options.revision ?? resolved.revision) : 1;
  const lines = [
    `<user-custom-instructions slot="${escapeXmlAttr(slot)}" status="active" revision="${revision}">`,
    slot === "prefix"
      ? "## User-Configured Persona & Foundational Instructions (High Priority)"
      : "## User-Configured Custom Instructions (High Priority)",
    "",
    "The following instructions are explicitly configured by the user in DSH Settings and apply to the current step.",
    "**Instruction Precedence & Conflict Resolution:**",
    "1. **Direct User Intent First:** An explicit request in the user's latest message takes precedence for that turn if it directly contradicts a default preference below.",
    "2. **Workspace Overrides Global:** Rules inside `<workspace-instructions>` are tailored for the active workspace and strictly override any conflicting defaults in `<global-instructions>`.",
    "3. **Supersedes Earlier Conversation Habits:** If earlier assistant responses or earlier system messages in this session followed different formatting, language, or behavioral habits, disregard those earlier habits and strictly follow the active rules below.",
  ];

  if (resolved.globalItems.length > 0) {
    lines.push("", "<global-instructions>");
    resolved.globalItems.forEach((item, index) => {
      lines.push(
        item.includeTitle === false
          ? `### [Global #${index + 1}]`
          : `### [Global #${index + 1}] ${item.title}`
      );
      lines.push(item.content);
      if (index < resolved.globalItems.length - 1) lines.push("");
    });
    lines.push("</global-instructions>");
  }

  if (resolved.workspaceItems.length > 0 && resolved.workspaceProfile) {
    const wsTitle = escapeXmlAttr(resolved.workspaceProfile.workspaceTitle || pathBaseName(resolved.workspaceProfile.workspacePath));
    const wsPath = escapeXmlAttr(resolved.workspaceProfile.workspacePath);
    const mode = escapeXmlAttr(resolved.mergeMode || "append");
    lines.push(
      "",
      `<workspace-instructions workspace="${wsTitle}" path="${wsPath}" mode="${mode}">`
    );
    resolved.workspaceItems.forEach((item, index) => {
      lines.push(
        item.includeTitle === false
          ? `### [Workspace #${index + 1}]`
          : `### [Workspace #${index + 1}] ${item.title}`
      );
      lines.push(item.content);
      if (index < resolved.workspaceItems.length - 1) lines.push("");
    });
    lines.push("</workspace-instructions>");
  }

  lines.push("</user-custom-instructions>");
  return lines.join("\n");
}

function renderClearedEnvelope(options = {}) {
  const slot = normalizePosition(options.slot);
  const revision = Number.isInteger(options.revision) ? options.revision : 1;
  return [
    `<user-custom-instructions slot="${escapeXmlAttr(slot)}" status="cleared" revision="${revision}">`,
    "All previously active `<user-custom-instructions>` in this slot (both global and workspace-level) have been cleared or disabled by the user and no longer apply. Do not continue custom formatting, persona, language, or behavioral rules from earlier turns unless explicitly requested in the user's latest message.",
    "</user-custom-instructions>",
  ].join("\n");
}

function renderEffectivePreview(state, cwd = "") {
  const prefixResolved = resolveEffectiveItems(state, cwd, "prefix");
  const suffixResolved = resolveEffectiveItems(state, cwd, "suffix");
  const prefixText = renderPriorityEnvelope(prefixResolved);
  const suffixText = renderPriorityEnvelope(suffixResolved);
  const blocks = [prefixText, suffixText].filter(Boolean);
  return {
    hasActive: blocks.length > 0,
    matchedWorkspace: suffixResolved.workspaceProfile || prefixResolved.workspaceProfile || null,
    mergeMode: suffixResolved.mergeMode,
    globalActiveCount: prefixResolved.globalItems.length + suffixResolved.globalItems.length,
    workspaceActiveCount: prefixResolved.workspaceItems.length + suffixResolved.workspaceItems.length,
    prefixText,
    suffixText,
    combinedText: blocks.join("\n\n"),
  };
}

function sessionHasPriorPromptMarker(session, slot = "suffix") {
  if (!session || typeof session !== "object") return false;
  const targetSlot = normalizePosition(slot);
  const marker = `<user-custom-instructions slot="${targetSlot}" status="active"`;
  try {
    if (typeof session.snapshotEvents === "function") {
      const events = session.snapshotEvents();
      if (Array.isArray(events)) {
        for (const ev of events) {
          if (ev?.type !== "system/message") continue;
          const content = ev?.data?.message?.content;
          if (!Array.isArray(content)) continue;
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string" && block.text.includes(marker)) {
              return true;
            }
          }
        }
      }
    }
  } catch {
    // Ignore inspection errors on minimal mocks.
  }
  return false;
}

function createSessionPromptTracker() {
  const memory = new Map();
  return {
    resolveSlotText(state, { sessionId = "", session = null, cwd = "", slot = "suffix" } = {}) {
      const targetSlot = normalizePosition(slot);
      const resolved = resolveEffectiveItems(state, cwd, targetSlot);
      const key = String(sessionId || session?.id || "");
      if (resolved.active) {
        if (key) {
          const entry = memory.get(key) || { prefix: false, suffix: false };
          entry[targetSlot] = true;
          memory.set(key, entry);
        }
        return renderPriorityEnvelope(resolved);
      }
      const hadInMemory = key ? Boolean(memory.get(key)?.[targetSlot]) : false;
      const hadInSession = !hadInMemory && sessionHasPriorPromptMarker(session, targetSlot);
      if (hadInMemory || hadInSession) {
        if (key && !hadInMemory) {
          const entry = memory.get(key) || { prefix: false, suffix: false };
          entry[targetSlot] = true;
          memory.set(key, entry);
        }
        return renderClearedEnvelope({ slot: targetSlot, revision: state?.revision || 1 });
      }
      return "";
    },
    hasInjected(sessionId, slot = "suffix") {
      return Boolean(memory.get(String(sessionId || ""))?.[normalizePosition(slot)]);
    },
    clear() {
      memory.clear();
    },
  };
}

function summaryCounts(state) {
  const normalized = normalizeState(state);
  const globalCount = normalized.globalItems.filter((item) => item.enabled !== false).length;
  let workspaceCount = 0;
  for (const profile of Object.values(normalized.workspaces)) {
    if (!profile || profile.enabled === false) continue;
    if ((profile.items || []).some((item) => item.enabled !== false)) {
      workspaceCount += 1;
    }
  }
  return {
    enabled: normalized.enabled,
    globalCount,
    workspaceCount,
  };
}

function getTemplates(t) {
  const translate = typeof t === "function" ? t : (k) => k;
  return TEMPLATE_IDS.map((id) => ({
    id,
    label: translate(`tpl.${id}.label`),
    title: translate(`tpl.${id}.title`),
    position: id === "readOnlyDesign" ? "suffix" : "suffix",
    content: translate(`tpl.${id}.content`),
  }));
}

module.exports = {
  MAX_TITLE_LENGTH,
  MAX_CONTENT_LENGTH,
  MAX_ITEMS_PER_SCOPE,
  PREFIX_ORDER,
  SUFFIX_ORDER,
  PREFIX_SECTION_NAME,
  SUFFIX_SECTION_NAME,
  TEMPLATE_IDS,
  normalizePath,
  pathKey,
  pathBaseName,
  isSameOrSubPath,
  escapeXmlAttr,
  generateId,
  normalizePosition,
  normalizeMergeMode,
  normalizeItem,
  normalizeItemList,
  normalizeWorkspaceProfile,
  defaultState,
  normalizeState,
  findWorkspaceKey,
  matchWorkspaceProfile,
  mergeWorkspaceCatalog,
  applyMutation,
  resolveEffectiveItems,
  renderPriorityEnvelope,
  renderClearedEnvelope,
  renderEffectivePreview,
  sessionHasPriorPromptMarker,
  createSessionPromptTracker,
  summaryCounts,
  getTemplates,
};
