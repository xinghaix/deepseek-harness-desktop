window.__ModuleLoader__.load({
  id: "dsh-hindsight-settings",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const dictionaries = __HINDSIGHT_LOCALES__;
    const css = __HINDSIGHT_CSS__;
    const NS = "dsh-hindsight-settings";
    const api = "/api/dsh-hindsight-settings/";

    async function request(path, body, signal) {
      let response;
      try {
        response = await fetch(api + path, {
          method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal,
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new Error("network");
      }
      let data;
      try { data = await response.json(); } catch { throw new Error("network"); }
      if (!response.ok || !data.ok) throw new Error(data.code || "internalError");
      return data;
    }
    function MemoryIcon() {
      return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
        h("path", { d: "M12 3C7 3 4 5 4 8v8c0 3 3 5 8 5s8-2 8-5V8c0-3-3-5-8-5Z M4 8c0 3 16 3 16 0 M4 13c0 3 16 3 16 0" }),
        h("path", { d: "M9 17h6" }));
    }
    function SettingsView({ t, compact = false }) {
      const [state, setState] = React.useState(null);
      const [workspaceId, setWorkspaceId] = React.useState("");
      const [draftEnabled, setDraftEnabled] = React.useState(false);
      const [draftPolicy, setDraftPolicy] = React.useState("inherit");
      const [consent, setConsent] = React.useState(false);
      const [busy, setBusy] = React.useState("read");
      const [error, setError] = React.useState("");
      const [notice, setNotice] = React.useState("");
      const requestRef = React.useRef(null);
      const sequence = React.useRef(0);
      const operation = React.useRef(false);
      const id = React.useId();
      const repo = state?.repository;
      const globalDirty = Boolean(state && draftEnabled !== state.dshEnabled);
      const repoDirty = Boolean(repo && draftPolicy !== repo.policy);
      const dirty = globalDirty || repoDirty;

      function accept(next) {
        setState(next);
        setDraftEnabled(next.dshEnabled);
        setDraftPolicy(next.repository?.policy || "inherit");
        setConsent(false);
      }
      async function load(selected = workspaceId) {
        if (operation.current) return;
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        const ticket = ++sequence.current;
        setBusy("read"); setError(""); setNotice("");
        try {
          const data = await request("state" + (selected ? "?workspaceId=" + encodeURIComponent(selected) : ""), undefined, controller.signal);
          if (sequence.current === ticket) accept(data.status);
        } catch (failure) {
          if (sequence.current === ticket && failure.name !== "AbortError") setError(failure.message);
        } finally {
          if (sequence.current === ticket) setBusy("");
        }
      }
      React.useEffect(() => {
        load(workspaceId);
        return () => { ++sequence.current; requestRef.current?.abort(); };
      }, [workspaceId]);

      async function save() {
        if (busy || operation.current || !dirty || repoDirty && !consent) return;
        operation.current = true;
        const ticket = ++sequence.current;
        const body = { revision: state.revision, workspaceId: workspaceId || undefined };
        if (globalDirty) body.dshEnabled = draftEnabled;
        if (repoDirty) Object.assign(body, { repositoryPolicy: draftPolicy, bankId: repo.bankId, confirmShared: consent });
        setBusy("save"); setError(""); setNotice("");
        try {
          // 保存请求不因视图离开而取消；完成后只向仍存在的视图提交状态。
          const data = await request("save", body);
          if (sequence.current !== ticket) return;
          if (data.status) accept(data.status);
          else setState(null);
          if (data.warning) setError(data.warning);
          else setNotice(data.saved ? "saved" : "unchanged");
        } catch (failure) {
          if (sequence.current === ticket) setError(failure.message);
        } finally {
          operation.current = false;
          if (sequence.current === ticket) setBusy("");
        }
      }
      function discard() { accept(state); setError(""); setNotice(""); }
      function errorText(code) { return t("error." + (dictionaries.en["error." + code] ? code : "internalError")); }
      const button = (label, onClick, disabled, primary = false) => h("button", { type: "button", className: "dhs-button" + (primary ? " dhs-primary" : ""), onClick, disabled }, label);
      return h("section", { className: "dhs-root", "aria-busy": Boolean(busy) },
        h("style", null, css),
        h("header", { className: "dhs-header" },
          h("div", null, !compact && h("h2", { className: "dhs-title" }, h(MemoryIcon), t("title")), h("p", { className: "dhs-muted" }, t("description"))),
          button(t(dirty ? "reloadDiscard" : "refresh"), () => load(), Boolean(busy))),
        h("div", { className: "dhs-notice" },
          h("strong", null, t(state?.changedThisRun ? "pendingTitle" : "restartTitle")),
          h("p", null, t("restartHint"))),
        h("div", { className: "dhs-feedback", role: "status", "aria-live": "polite", "aria-atomic": true },
          busy ? t(busy === "save" ? "saving" : "loading") : notice ? t(notice) : dirty ? t("dirty") : ""),
        error && h("div", { className: "dhs-error", role: "alert" }, errorText(error), !state && button(t("retry"), () => load(), Boolean(busy))),
        state && h(React.Fragment, null,
          h("div", { className: "dhs-setting" },
            h("div", { className: "dhs-setting-text" },
              h("label", { htmlFor: id + "-switch", className: "dhs-heading" }, t("globalTitle")),
              h("p", { id: id + "-hint", className: "dhs-muted" }, t("globalHint"))),
            h("div", { className: "dhs-switch-area" }, h("span", { className: "dhs-muted", "aria-hidden": true }, t(draftEnabled ? "on" : "off")),
              h("button", { id: id + "-switch", type: "button", role: "switch", "aria-checked": draftEnabled, "aria-describedby": id + "-hint", "aria-label": t("globalTitle"), className: "dhs-switch", disabled: Boolean(busy), onClick: () => setDraftEnabled(value => !value) }, h("span", { className: "dhs-track" }, h("span", { className: "dhs-thumb" }))))),
          h("section", { className: "dhs-repository", "aria-labelledby": id + "-repo-title" },
            h("h3", { id: id + "-repo-title", className: "dhs-heading" }, t("repositoryTitle")),
            h("p", { className: "dhs-muted" }, t("repositoryHint")),
            h("label", { htmlFor: id + "-workspace", className: "dhs-label" }, t("workspace")),
            h("select", { id: id + "-workspace", value: workspaceId, disabled: Boolean(busy) || dirty, onChange: event => { setState(null); setWorkspaceId(event.target.value); } },
              h("option", { value: "" }, t("chooseWorkspace")),
              ...[...state.workspaces].sort((a, b) => (a.title || a.path).localeCompare(b.title || b.path)).map(workspace => h("option", { key: workspace.id, value: workspace.id }, (workspace.title || workspace.path) + (workspace.title ? " — " + workspace.path : "")))),
            !state.workspaces.length && h("p", { className: "dhs-muted" }, t("emptyWorkspaces")),
            state.repositoryError && h("p", { className: "dhs-error", role: "alert" }, errorText(state.repositoryError)),
            repo && h(React.Fragment, null,
              h("dl", { className: "dhs-facts" }, h("dt", null, t("bank")), h("dd", null, repo.bankId),
                repo.destinationBank !== repo.bankId && h(React.Fragment, null, h("dt", null, t("destination")), h("dd", null, repo.destinationBank))),
              h("fieldset", { className: "dhs-policies", disabled: Boolean(busy) || repo.overridden },
                h("legend", { className: "dhs-sr-only" }, t("repositoryTitle")),
                ...["inherit", "enabled", "disabled"].map(policy => h("label", { key: policy, className: "dhs-policy", "data-selected": draftPolicy === policy },
                  h("input", { type: "radio", name: id + "-policy", value: policy, checked: draftPolicy === policy, onChange: () => { setDraftPolicy(policy); setConsent(false); } }), t(policy)))),
              h("p", { className: "dhs-muted" }, t("policyHint")),
              repo.overridden && h("p", { className: "dhs-notice" }, t("overridden")),
              h("p", { className: "dhs-effective" }, h("span", { className: "dhs-dot", "data-enabled": repo.enabled, "aria-hidden": true }), t("savedPolicy") + ": " + t(repo.reason)),
              repoDirty && h("label", { className: "dhs-consent" }, h("input", { type: "checkbox", checked: consent, disabled: Boolean(busy), onChange: event => setConsent(event.target.checked) }), t("sharedConsent")))),
          h("footer", { className: "dhs-footer" },
            h("p", { className: "dhs-muted" }, t("runtimeUnknown")),
            h("div", { className: "dhs-actions" }, button(t("discard"), discard, !dirty || Boolean(busy)), button(t(busy === "save" ? "saving" : "save"), save, !dirty || Boolean(busy) || repoDirty && !consent, true))),
          h("details", { className: "dhs-details" }, h("summary", null, t("details")),
            h("dl", { className: "dhs-facts" }, h("dt", null, t("configPath")), h("dd", null, state.configPath),
              repo?.pathOverride && h(React.Fragment, null, h("dt", null, t("pathOverride")), h("dd", null, repo.pathOverride))),
            !state.exists && h("p", null, t("missingConfig")), h("p", null, t(state.memoryToolsRegistered ? "toolsPresent" : "toolsAbsent"))),
          h("details", { className: "dhs-details" }, h("summary", null, t("privacyTitle")), h("p", null, t("privacyHint")))));
    }
    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        for (const [locale, dictionary] of Object.entries(dictionaries)) ctx.effect(() => ctx.locale.register(NS, locale, dictionary));
        const t = ctx.locale.bind(NS);
        ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: NS, order: 24, label: () => t("title"), locale: NS }, props => h(SettingsView, { t: props.t })));
        ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({ name: "plugins.bundle.config", key: NS, locale: NS }, props => props.view === "summary" ? props.t("description") : h(SettingsView, { t: props.t, compact: true })));
      },
    };
  },
});
