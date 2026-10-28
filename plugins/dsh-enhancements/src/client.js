window.__ModuleLoader__.load({
  id: "dsh-enhancements",
  factory: (require) => {
    const React = require("react");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
    const { Modal } = require("@deepseek-ai/dsh-client-ui-primitives");
    const model = __ENHANCEMENTS_MODEL__;
    const locales = __ENHANCEMENTS_LOCALES__;
    const h = React.createElement;
    const NS = "dsh-enhancements";
    const SECTION = "dsh-enhancements.archives";
    const pageStyle = { display: "flex", flexDirection: "column", gap: 18, maxWidth: 960, color: "var(--dsw-alias-label-primary)", padding: "4px 0" };
    const muted = { color: "var(--dsw-alias-label-tertiary)", margin: 0 };
    const rowStyle = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 };
    const buttonStyle = { font: "inherit", padding: "7px 12px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", color: "inherit", cursor: "pointer" };
    const inputStyle = { ...buttonStyle, boxSizing: "border-box", width: "100%", cursor: "text" };

    function button(label, onClick, disabled = false, props = {}) {
      return h("button", { type: "button", style: { ...buttonStyle, opacity: disabled ? 0.5 : 1 }, disabled, onClick, ...props }, label);
    }

    function createController(form) {
      let services;
      let slotReady = false;
      let disposed = false;
      let saving = false;
      let saveFailed = false;
      let query = "";
      let selected = new Set();
      // Navigation labels re-register on locale changes; pending consent belongs to the controller, not that render occurrence.
      let confirmation = null;
      let confirmChanged = false;
      const accessSubscriptions = new Map();
      const store = createSnapshotStore({});
      const allowed = (id) => services?.remoteAccess.source("session", id, model.RESTORE_ACTION).getSnapshot() === true;
      const current = () => {
        const config = form.getSnapshot();
        const sessions = services?.sessions.list.getSnapshot();
        const workspaces = services?.workspaces.list.getSnapshot();
        const reason = model.archiveAvailability(config, sessions, workspaces, Boolean(services), slotReady);
        const rows = model.archiveRows(sessions, workspaces);
        return { config, sessions, workspaces, reason, rows };
      };
      let runner;
      const publish = () => {
        if (disposed) return;
        const state = current();
        const ids = new Set(state.rows.map(row => row.id));
        for (const [id, off] of accessSubscriptions) {
          if (!ids.has(id)) { off(); accessSubscriptions.delete(id); }
        }
        if (services) {
          for (const id of ids) {
            if (!accessSubscriptions.has(id)) {
              accessSubscriptions.set(id, services.remoteAccess.source("session", id, model.RESTORE_ACTION).subscribe(publish));
            }
          }
        }
        if (state.sessions?.phase === "ready" && state.workspaces?.phase === "ready") {
          selected = new Set([...selected].filter(id => ids.has(id)));
        }
        const rows = state.rows.map(row => ({ ...row, allowed: !row.missing && allowed(row.id) }));
        const visibleIds = new Set(model.archiveRows(state.sessions, state.workspaces, query).map(row => row.id));
        store.set({
          config: state.config, reason: state.reason, rows, visible: rows.filter(row => visibleIds.has(row.id)),
          query, selected: [...selected], confirmation, confirmChanged, saving, saveFailed, batch: runner.getSnapshot(),
        });
      };
      runner = model.createRestoreRunner({
        inspect(id) {
          const state = current();
          const row = state.rows.find(item => item.id === id);
          return { reason: state.reason || (row?.missing ? "missingMetadata" : null), archived: Boolean(row), allowed: allowed(id) };
        },
        async restore(id) {
          await services.workspaces.unarchiveSession(id);
          selected.delete(id);
        },
        changed: publish,
      });
      const offConfig = form.subscribe(publish);
      const controller = {
        subscribe: store.subscribe.bind(store),
        getSnapshot: store.getSnapshot.bind(store),
        setSlotReady(value) { slotReady = value; publish(); },
        attach(next) { services = next; publish(); },
        detach() {
          runner.stop();
          for (const off of accessSubscriptions.values()) off();
          accessSubscriptions.clear();
          services = undefined;
          publish();
        },
        sync: publish,
        setQuery(value) { query = String(value); publish(); },
        toggle(id, checked) {
          if (disposed || runner.getSnapshot().running) return;
          const row = store.getSnapshot().rows.find(item => item.id === id);
          if (checked && row?.allowed) selected.add(id);
          else selected.delete(id);
          publish();
        },
        selectVisible() {
          if (disposed || runner.getSnapshot().running) return;
          for (const row of store.getSnapshot().visible) if (row.allowed) selected.add(row.id);
          publish();
        },
        clearSelection() { if (!runner.getSnapshot().running) { selected.clear(); publish(); } },
        selectFailed() {
          if (disposed || runner.getSnapshot().running) return;
          const rows = store.getSnapshot().rows;
          selected = new Set(runner.getSnapshot().failed.filter(item => rows.some(row => row.id === item.id && row.allowed)).map(item => item.id));
          publish();
        },
        requestConfirmation() {
          if (disposed || store.getSnapshot().reason || runner.getSnapshot().running || !selected.size) return;
          confirmation = [...selected];
          confirmChanged = false;
          publish();
        },
        dismissConfirmation() { confirmation = null; publish(); },
        async confirmRestore() {
          if (!confirmation) return false;
          const targets = confirmation;
          confirmation = null;
          const pending = controller.restore(targets);
          publish();
          const accepted = await pending;
          if (!accepted) { confirmChanged = true; publish(); }
          return accepted;
        },
        async restore(ids) {
          if (disposed || store.getSnapshot().reason || runner.getSnapshot().running) return false;
          const targets = model.uniqueIds(ids);
          const actual = [...selected];
          if (targets.length !== actual.length || targets.some(id => !selected.has(id))) return false;
          return runner.run(targets);
        },
        stop: () => runner.stop(),
        async setEnabled(value) {
          if (disposed || saving || runner.getSnapshot().running || typeof value !== "boolean") return;
          const config = form.getSnapshot();
          if (config.status !== "ready" || !config.writable) return;
          saving = true;
          saveFailed = false;
          publish();
          try {
            const accepted = await form.set("archiveManager", value);
            saveFailed = accepted !== true || form.getSnapshot().value?.archiveManager !== value;
          } catch {
            saveFailed = true;
          } finally {
            saving = false;
            publish();
          }
        },
        dispose() {
          disposed = true;
          runner.dispose();
          offConfig();
          for (const off of accessSubscriptions.values()) off();
          accessSubscriptions.clear();
        },
      };
      publish();
      return controller;
    }

    function useStateOf(controller) {
      return React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
    }

    function Settings({ state, controller, t }) {
      const ready = state.config.status === "ready";
      return h("section", { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h("label", { style: rowStyle },
          h("input", {
            type: "checkbox", checked: state.config.value?.archiveManager === true,
            disabled: !ready || !state.config.writable || state.saving || state.batch.running,
            onChange: event => { void controller.setEnabled(event.target.checked); },
          }), t("enableArchives")),
        h("p", { style: muted }, t("settingsHint")),
        !ready ? h("p", { role: "status" }, t(state.config.status === "loading" ? "settingsLoading" : "settingsUnavailable")) : null,
        ready && !state.config.writable ? h("p", { role: "status" }, t("settingsReadOnly")) : null,
        state.saving ? h("p", { role: "status" }, t("saving")) : null,
        state.saveFailed ? h("p", { role: "alert" }, t("saveFailed")) : null);
    }

    function Capabilities({ state, t }) {
      const status = state.reason === null ? "statusReady" : state.reason === "reasonDisabled" ? "statusDisabled" : "statusUnavailable";
      return h("section", null,
        h("h3", null, t("capabilities")),
        h("dl", { style: { display: "grid", gridTemplateColumns: "minmax(100px, 1fr) 2fr", gap: "10px 18px", margin: 0 } },
          h("dt", null, t("capabilityArchive")), h("dd", { style: { margin: 0 } }, t(status)),
          h("dt", null, t("capabilityRestore")), h("dd", { style: { margin: 0 } }, t(status)),
          h("dt", null, t("capabilityDelete")), h("dd", { style: { margin: 0 } }, t("statusUnsupported"))),
        state.reason ? h("p", { style: muted, role: "status" }, t(state.reason)) : null,
        h("p", { style: { ...muted, marginTop: 10 } }, t("reasonDelete")));
    }

    function BundlePage(props) {
      if (props.view === "summary") return props.t("description");
      return h(EnhancementPage, props);
    }

    function EnhancementPage({ controller, t }) {
      const state = useStateOf(controller);
      return h("section", { style: pageStyle, "aria-label": t("title") },
        h("p", { style: muted }, t("description")),
        h(Settings, { state, controller, t }),
        h(Capabilities, { state, t }));
    }

    function ArchiveRow({ row, selected, disabled, controller, t }) {
      const id = React.useId();
      return h("li", { style: { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)" } },
        h("input", { id, type: "checkbox", style: { marginTop: 5 }, checked: selected, disabled: disabled || !row.allowed, onChange: event => controller.toggle(row.id, event.target.checked) }),
        h("div", { style: { flex: 1, minWidth: 0 } },
          h("label", { htmlFor: id, style: { display: "block", fontWeight: 550, overflowWrap: "anywhere" } }, row.title),
          h("div", { style: { ...muted, fontSize: ".85em", overflowWrap: "anywhere", marginTop: 4 } }, row.workspace || t("workspaceUnknown")),
          h("code", { style: { ...muted, fontSize: ".8em", overflowWrap: "anywhere" } }, row.id),
          row.missing ? h("p", { style: muted }, t("missingMetadata")) : !row.allowed ? h("p", { style: muted }, t("permissionDenied")) : null),
        h("span", { style: { ...muted, fontSize: ".8em" } }, t(row.running ? "running" : "idle")));
    }

    function BatchResult({ state, controller, t }) {
      const batch = state.batch;
      if (!batch.total) return null;
      const titles = new Map(state.rows.map(row => [row.id, row.title]));
      return h("section", { "aria-label": t("resultTitle"), style: { padding: 14, border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10 } },
        h("p", { role: "status", "aria-live": "polite", style: { marginTop: 0 } }, t("progress", { done: batch.done, total: batch.total })),
        h("div", { style: rowStyle },
          h("span", null, t("completed", { count: batch.restored.length })),
          h("span", null, t("failed", { count: batch.failed.length })),
          h("span", null, t("skipped", { count: batch.skipped.length }))),
        batch.cancelled ? h("p", { role: "status" }, t("cancelled")) : null,
        batch.failed.length ? h("ul", null, batch.failed.map(item => h("li", { key: item.id }, `${titles.get(item.id) || item.id}: ${t(item.reason)}`))) : null,
        !batch.running && batch.failed.length ? button(t("retryFailed"), controller.selectFailed, state.reason !== null) : null);
    }

    function ArchivesPage({ controller, t }) {
      const state = useStateOf(controller);
      const { confirmation, confirmChanged } = state;
      const ready = state.reason === null;
      const busy = state.batch.running;
      const stopping = state.batch.stopping;
      const selected = new Set(state.selected);
      const confirmValid = confirmation && ready && !busy && confirmation.length === state.selected.length && confirmation.every(id => selected.has(id));
      return h("section", { style: pageStyle, "aria-label": t("archivesTitle") },
        h("div", null, h("h2", { style: { margin: "0 0 8px" } }, t("archivesTitle")), h("p", { style: muted }, t("archivesDescription"))),
        h(Settings, { state, controller, t }),
        !ready ? h("p", { role: "status" }, t(state.reason)) : null,
        confirmChanged ? h("p", { role: "alert" }, t("confirmChanged")) : null,
        h("input", { type: "search", value: state.query, style: inputStyle, "aria-label": t("search"), placeholder: t("search"), onChange: event => controller.setQuery(event.target.value) }),
        h("div", { style: rowStyle },
          button(t("selectVisible"), controller.selectVisible, !ready || busy || !state.visible.some(row => row.allowed)),
          button(t("clearSelection"), controller.clearSelection, busy || !selected.size),
          h("span", { role: "status" }, t("selected", { count: selected.size })),
          h("span", { style: muted }, t("visible", { count: state.visible.length })),
          busy ? button(t(stopping ? "stopRequested" : "stop"), controller.stop, stopping) : button(t("restoreSelected"), controller.requestConfirmation, !ready || !selected.size)),
        h("p", { style: { ...muted, fontSize: ".85em" } }, t("batchNotAtomic")),
        ready && !state.visible.length ? h("p", null, t(state.rows.length ? "noMatches" : "empty")) : null,
        h("ul", { style: { listStyle: "none", padding: 0, margin: 0 } }, state.visible.map(row => h(ArchiveRow, { key: row.id, row, selected: selected.has(row.id), disabled: !ready || busy, controller, t }))),
        h(BatchResult, { state, controller, t }),
        h(Modal, {
          open: confirmation !== null, title: t("confirmTitle"), closeLabel: t("close"),
          description: t("confirmDescription", { count: confirmation?.length || 0 }),
          onClose: controller.dismissConfirmation,
          footer: h("div", { style: { ...rowStyle, justifyContent: "flex-end" } },
            button(t("cancel"), controller.dismissConfirmation),
            button(t("confirmAction"), () => { void controller.confirmRestore(); }, !confirmValid, { "data-modal-autofocus": "" })),
        }, !confirmValid && confirmation ? h("p", { role: "alert" }, t("confirmChanged")) : null));
    }

    function apply(ctx) {
      for (const [id, dictionary] of Object.entries(locales)) ctx.effect(() => ctx.locale.register(NS, id, dictionary));
      const controller = createController(ctx.configForms.get(NS));
      ctx.effect(() => () => controller.dispose());
      const face = { controller };
      ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
        name: "plugins.bundle.config", key: NS, locale: NS, inject: () => face,
      }, BundlePage));
      ctx.slots.inject("settings.section", () => {
        const t = ctx.locale.bind(NS);
        let active = ctx.locale.getSnapshot().active;
        let remove = () => {};
        const register = () => {
          remove();
          remove = ctx.slots.register({ name: "settings.section", id: SECTION, order: 25, label: () => t("archivesTitle"), locale: NS, inject: () => face }, ArchivesPage);
        };
        register();
        controller.setSlotReady(true);
        const stopLocale = ctx.locale.subscribe(() => {
          const next = ctx.locale.getSnapshot().active;
          if (next !== active) { active = next; register(); }
        });
        return () => { stopLocale(); remove(); controller.setSlotReady(false); };
      });
      ctx.inject(["sessions", "workspaces", "remoteAccess"], (scope) => {
        const services = { sessions: scope.sessions, workspaces: scope.workspaces, remoteAccess: scope.remoteAccess };
        if (typeof services.sessions.list?.getSnapshot !== "function" || typeof services.workspaces.list?.getSnapshot !== "function" || typeof services.workspaces.unarchiveSession !== "function" || typeof services.remoteAccess.source !== "function") return;
        const offSessions = services.sessions.list.subscribe(controller.sync);
        const offWorkspaces = services.workspaces.list.subscribe(controller.sync);
        controller.attach(services);
        return () => { offSessions(); offWorkspaces(); controller.detach(); };
      });
    }
    return { apply, inject: ["slots", "locale", "configForms"] };
  },
});
