const RESTORE_ACTION = "workspace/unarchiveSession";

function archiveAvailability(config, sessions, workspaces, services, slotReady) {
  if (config?.status !== "ready" || typeof config.value?.archiveManager !== "boolean") return "reasonSettings";
  if (!config.value.archiveManager) return "reasonDisabled";
  if (!services) return "reasonServices";
  if (!slotReady) return "reasonSlot";
  if (workspaces?.state === "error") return "reasonConnection";
  if (sessions?.phase !== "ready" || workspaces?.phase !== "ready") return "reasonLoading";
  return null;
}

function archiveRows(sessions, workspaces, query = "") {
  const members = new Set(Array.isArray(sessions?.ids) ? sessions.ids : []);
  const archived = Array.isArray(workspaces?.archivedSessionIds) ? workspaces.archivedSessionIds : [];
  const byId = sessions?.byId ?? {};
  const grouped = new Map();
  for (const workspace of workspaces?.items ?? []) {
    for (const id of workspace.sessionIds ?? []) {
      if (!grouped.has(id)) grouped.set(id, workspace.title || workspace.path || "");
    }
  }
  const needle = String(query).trim().toLowerCase();
  const seen = new Set();
  const rows = [];
  for (const id of archived) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    // A fallback retained child is not a Host-list member and cannot supply metadata for this page.
    const summary = members.has(id) && Object.hasOwn(byId, id) ? byId[id] : undefined;
    if (summary?.origin === "subagent") continue;
    const row = {
      id,
      title: summary?.displayTitle || summary?.title || id,
      workspace: grouped.get(id) || summary?.cwd || "",
      updatedAt: Number.isFinite(summary?.updatedAt) ? summary.updatedAt : 0,
      running: summary?.running === true,
      missing: summary === undefined,
    };
    if (!needle || [row.title, row.id, row.workspace].some(value => value.toLowerCase().includes(needle))) rows.push(row);
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(id => typeof id === "string" && id.length > 0))];
}

function createRestoreRunner({ inspect, restore, changed = () => {} }) {
  let stopped = false;
  let disposed = false;
  let snapshot = Object.freeze({ running: false, stopping: false, total: 0, done: 0, restored: [], failed: [], skipped: [], cancelled: false });
  const publish = (patch) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    if (!disposed) changed(snapshot);
  };
  const classify = (id) => {
    const state = inspect(id);
    if (state.reason) return { id, reason: state.reason };
    if (!state.archived) return { id, reason: "noLongerArchived", skipped: true };
    if (!state.allowed) return { id, reason: "permissionDenied" };
    return null;
  };
  return {
    getSnapshot: () => snapshot,
    stop() { stopped = true; if (snapshot.running) publish({ stopping: true }); },
    dispose() { disposed = true; stopped = true; },
    async run(ids) {
      if (snapshot.running || disposed) return false;
      stopped = false;
      const targets = uniqueIds(ids);
      const restored = [];
      const failed = [];
      const skipped = [];
      publish({ running: true, stopping: false, total: targets.length, done: 0, restored: [], failed: [], skipped: [], cancelled: false });
      try {
        for (const id of targets) {
          if (stopped || disposed) break;
          try {
            const refusal = classify(id);
            if (refusal) {
              if (refusal.skipped) skipped.push(refusal);
              else failed.push(refusal);
            } else {
              await restore(id);
              restored.push(id);
            }
          } catch {
            // Do not project arbitrary Host diagnostics, paths or credentials into a batch result.
            failed.push({ id, reason: "operationFailed" });
          }
          publish({ done: restored.length + failed.length + skipped.length, restored: [...restored], failed: [...failed], skipped: [...skipped] });
        }
      } finally {
        publish({ running: false, stopping: false, cancelled: snapshot.done < targets.length });
      }
      return true;
    },
  };
}

module.exports = { RESTORE_ACTION, archiveAvailability, archiveRows, uniqueIds, createRestoreRunner };
