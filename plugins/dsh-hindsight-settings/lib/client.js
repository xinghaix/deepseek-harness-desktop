// 此文件由 scripts/build-client.mjs 生成，请编辑 src/ 下的源文件。
window.__ModuleLoader__.load({
  id: "dsh-hindsight-settings",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const dictionaries = {"zh":{"title":"Hindsight 记忆","description":"决定 DSH 何时使用长期记忆，不改动已有记忆内容。","refresh":"重新读取","reloadDiscard":"重新读取并放弃修改","loading":"正在读取配置…","retry":"重试","globalTitle":"在 DSH 中使用记忆","globalHint":"关闭后，重启 DSH 将停止 Hindsight 自动注入、采集和会话回写。不影响其它接入工具。","on":"开启","off":"关闭","repositoryTitle":"仓库策略","repositoryHint":"按记忆库（bank）设置，影响使用同一配置与 bank 的所有接入工具。多个仓库也可能共享一个 bank。","workspace":"工作区","chooseWorkspace":"选择工作区…","emptyWorkspaces":"暂无已登记工作区。请先在 DSH 中添加工作区；总开关仍可使用。","inherit":"跟随上层配置","enabled":"允许使用","disabled":"禁止使用","policyHint":"允许使用不会绕过 DSH 总开关或仅限已授权项目的 opt-in 策略。","bank":"记忆库","destination":"重定向目标","savedPolicy":"按已保存配置","allowed":"允许使用记忆","dshDisabled":"DSH 总开关已关闭","notOptedIn":"此项目未被 opt-in 策略授权","repositoryDisabled":"仓库或目录策略已禁用记忆","sharedConsent":"我确认此仓库策略也影响使用同一 bank 的其它接入工具。","restartTitle":"保存后，需要重启 DSH","restartHint":"刷新页面或新建会话不能可靠刷新已缓存的配置。请在空闲时重启 DSH 服务；若不希望旧记忆留在上下文中，再新建会话。","pendingTitle":"配置已保存，等待你重启 DSH","runtimeUnknown":"运行时生效状态无法直接读取；下方开关表示保存的配置，不是运行中状态。","save":"保存更改","saving":"正在保存…","discard":"放弃修改","dirty":"有未保存更改；离开此页会放弃草稿。","saved":"已保存。重启 DSH 后生效。","unchanged":"配置没有变化。","details":"配置与诊断","configPath":"配置文件","toolsPresent":"检测到 Hindsight 工具注册（不代表记忆正在运行）","toolsAbsent":"未检测到 Hindsight 工具注册。本插件不会安装或启动 Hindsight。","missingConfig":"配置文件尚不存在；保存时创建。","privacyTitle":"关闭后，历史记忆会删除吗？","privacyHint":"不会。此插件只修改开关，不连接 Hindsight 服务器，不读取、上传或删除记忆。已经写入服务端的记忆及后台任务需在 Hindsight 中管理。","overridden":"此 bank 被 harnesses.dsh.banks 覆盖。为避免修改无效或影响其它工具，此处只读；请在配置文件中调整覆盖项。","pathOverride":"匹配到目录覆盖","error.conflict":"配置已被其它窗口或程序修改。请重新读取后再操作，尚未覆盖外部修改。","error.configBusy":"配置正在被其它进程保存。如果持续出现，请检查诊断路径旁的 .dsh-hindsight-settings.lock；确认没有保存进程后再手动处理。","error.invalidConfig":"配置不是有效的 JSON 对象或相关字段类型错误。请修复配置文件后重试；原文件未被覆盖。","error.unsafeConfig":"配置路径不是普通文件（可能是符号链接）。请让 HINDSIGHT_CONFIG 指向实际文件后重启 DSH。","error.configTooLarge":"配置超过 1 MiB，无法安全编辑。","error.readFailed":"无法读取配置，请检查路径及文件权限。","error.writeFailed":"无法保存配置，请检查磁盘空间及目录权限后重新读取。","error.repositoryUnavailable":"无法可靠识别此仓库，仓库设置暂不可编辑。请检查目录和 .git；总开关仍可使用。","error.workspaceMissing":"工作区已不存在，请重新读取列表。","error.invalidBank":"无法解析有效的记忆库名称，请检查 bank 配置。","error.repositoryOverridden":"仓库策略被 DSH 专属配置覆盖，未修改。","error.confirmShared":"请确认仓库策略的跨工具影响。","error.badRequest":"请求无效，请重新读取后重试。","error.forbidden":"此操作仅允许已登录的 DSH 所有者。","error.closing":"插件正在停止，请稍后重试。","error.internalError":"操作失败，请重新读取后重试。","error.network":"无法连接 DSH，请检查连接后重试。","error.savedRefreshFailed":"配置已保存，但状态刷新失败。请重新读取；不要重复保存。"},"en":{"title":"Hindsight memory","description":"Choose when DSH uses long-term memory without changing existing memories.","refresh":"Reload","reloadDiscard":"Reload and discard changes","loading":"Reading configuration…","retry":"Retry","globalTitle":"Use memory in DSH","globalHint":"Turning this off stops Hindsight injection, ingestion and session retention after restarting DSH. Other harnesses are unaffected.","on":"On","off":"Off","repositoryTitle":"Repository policy","repositoryHint":"Applies to every harness using the same configuration and memory bank. Multiple repositories may share a bank.","workspace":"Workspace","chooseWorkspace":"Choose a workspace…","emptyWorkspaces":"No registered workspaces. Add one in DSH first; the DSH switch is still available.","inherit":"Inherit configuration","enabled":"Allow memory","disabled":"Block memory","policyHint":"Allowing memory does not bypass the DSH switch or opt-in project policy.","bank":"Memory bank","destination":"Redirected destination","savedPolicy":"Saved configuration","allowed":"Memory allowed","dshDisabled":"DSH memory switch is off","notOptedIn":"Project is not opted in","repositoryDisabled":"Repository or directory policy blocks memory","sharedConsent":"I understand this repository policy also affects other harnesses using this bank.","restartTitle":"Restart DSH after saving","restartHint":"Refreshing the page or creating a session does not reliably reload cached configuration. Restart the DSH service when idle, then start a new session if you want old memories out of context.","pendingTitle":"Saved; waiting for you to restart DSH","runtimeUnknown":"Live memory state is not directly available. These controls show saved configuration, not running state.","save":"Save changes","saving":"Saving…","discard":"Discard changes","dirty":"Unsaved changes. Leaving this page discards the draft.","saved":"Saved. Restart DSH to apply.","unchanged":"No configuration changes.","details":"Configuration and diagnostics","configPath":"Configuration file","toolsPresent":"Hindsight tools are registered (this does not prove memory is running)","toolsAbsent":"No Hindsight tool registration detected. This plugin does not install or start Hindsight.","missingConfig":"Configuration file does not exist yet; saving creates it.","privacyTitle":"Does turning memory off delete history?","privacyHint":"No. This plugin only edits switches. It does not contact the Hindsight server or read, upload or delete memories. Manage existing server memories and background tasks in Hindsight.","overridden":"harnesses.dsh.banks overrides this bank. Editing is disabled to avoid ineffective or cross-harness changes. Adjust that override in the configuration file.","pathOverride":"Matching directory override","error.conflict":"Configuration changed in another window or program. Reload before saving; external changes were not overwritten.","error.configBusy":"Another process is saving. If this persists, check the .dsh-hindsight-settings.lock beside the configuration; remove it manually only after confirming no writer is active.","error.invalidConfig":"Configuration is not a valid JSON object or related fields have invalid types. Fix the file and retry; it was not overwritten.","error.unsafeConfig":"Configuration is not a regular file (it may be a symlink). Point HINDSIGHT_CONFIG at the actual file and restart DSH.","error.configTooLarge":"Configuration exceeds the 1 MiB editing limit.","error.readFailed":"Cannot read configuration. Check its path and permissions.","error.writeFailed":"Cannot save configuration. Check disk space and directory permissions, then reload.","error.repositoryUnavailable":"Cannot reliably identify this repository. Check its directory and .git; the DSH switch is still available.","error.workspaceMissing":"Workspace no longer exists. Reload the list.","error.invalidBank":"Cannot resolve a valid memory bank. Check bank configuration.","error.repositoryOverridden":"DSH-specific configuration overrides this repository; nothing changed.","error.confirmShared":"Confirm the repository policy's effect on other harnesses.","error.badRequest":"Invalid request. Reload and retry.","error.forbidden":"Only the authenticated DSH owner can perform this operation.","error.closing":"Plugin is stopping. Try again later.","error.internalError":"Operation failed. Reload and retry.","error.network":"Cannot connect to DSH. Check the connection and retry.","error.savedRefreshFailed":"Configuration was saved, but status could not refresh. Reload instead of saving again."}};
    const css = ".dhs-root{width:100%;max-width:820px;min-width:0;box-sizing:border-box;padding:4px 0 32px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.6}\n.dhs-root *{box-sizing:border-box}\n.dhs-root p{margin:4px 0 0}\n.dhs-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}\n.dhs-title{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:500;line-height:28px;margin:0}\n.dhs-muted{color:var(--dsw-alias-label-secondary)}\n.dhs-heading{font-size:14px;font-weight:500;line-height:22px;margin:0}\n.dhs-notice{padding:12px 16px;border-inline-start:3px solid var(--dsw-alias-state-warning-primary);border-radius:4px;background:var(--dsw-alias-bg-layer-2)}\n.dhs-notice p{color:var(--dsw-alias-label-secondary)}\n.dhs-feedback{min-height:36px;padding:8px 0;color:var(--dsw-alias-label-secondary)}\n.dhs-error{padding:12px 0;color:var(--dsw-alias-state-error-primary)}\n.dhs-error .dhs-button{margin-inline-start:12px}\n.dhs-setting{display:flex;align-items:center;gap:20px;justify-content:space-between;padding:16px;border:1px solid var(--dsw-alias-settings-card-stroke);border-radius:12px;background:var(--dsw-alias-settings-card-fill)}\n.dhs-setting-text{min-width:0;flex:1}\n.dhs-switch-area{display:flex;align-items:center;gap:8px;flex:none}\n.dhs-switch{border:0;background:transparent;display:flex;align-items:center;justify-content:center;cursor:pointer;width:44px;height:44px;padding:4px;border-radius:8px}\n.dhs-track{width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-border-l4);padding:2px;transition:background .14s ease}\n.dhs-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .14s ease}\n.dhs-switch[aria-checked=true] .dhs-track{background:var(--dsw-alias-brand-primary)}\n.dhs-switch[aria-checked=true] .dhs-thumb{transform:translateX(16px)}\n.dhs-switch:disabled{opacity:.5;cursor:default}\n.dhs-button{min-height:36px;padding:6px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-secondary-fill);font:inherit;cursor:pointer;white-space:normal;transition:background .14s ease}\n.dhs-button:hover:not(:disabled){background:var(--dsw-alias-button-secondary-hover)}\n.dhs-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-white);border-color:transparent}\n.dhs-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}\n.dhs-button:disabled{opacity:.5;cursor:default}\n.dhs-root :is(button,select,input,summary):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}\n.dhs-repository{margin-top:28px}\n.dhs-label{display:block;margin:16px 0 6px;font-weight:500}\n.dhs-root select{width:100%;min-width:0;min-height:40px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;text-overflow:ellipsis}\n.dhs-root select:disabled{opacity:.6}\n.dhs-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 16px;margin:16px 0}\n.dhs-facts dt{color:var(--dsw-alias-label-secondary)}\n.dhs-facts dd{margin:0;overflow-wrap:anywhere;user-select:text}\n.dhs-policies{display:flex;flex-wrap:wrap;gap:8px;border:0;padding:0;margin:16px 0 8px;min-width:0}\n.dhs-policy{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;cursor:pointer}\n.dhs-policy[data-selected=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}\n.dhs-policies:disabled .dhs-policy{cursor:default;opacity:.6}\n.dhs-root input{accent-color:var(--dsw-alias-brand-primary);width:16px;height:16px;flex:none;margin:0}\n.dhs-root .dhs-effective{display:flex;align-items:baseline;gap:8px;margin-top:12px}\n.dhs-dot{display:inline-block;width:7px;height:7px;flex:none;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}\n.dhs-dot[data-enabled=true]{background:var(--dsw-alias-state-success-primary)}\n.dhs-consent{display:flex;align-items:flex-start;gap:10px;padding:14px 0;cursor:pointer}\n.dhs-consent input{margin-top:3px}\n.dhs-footer{border-top:1px solid var(--dsw-alias-border-l2);margin-top:24px;padding:16px 0}\n.dhs-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:16px}\n.dhs-details{border-top:1px solid var(--dsw-alias-border-l1);padding:12px 0;color:var(--dsw-alias-label-secondary)}\n.dhs-details summary{cursor:pointer;color:var(--dsw-alias-label-primary);min-height:28px}\n.dhs-details p{max-width:72ch}\n.dhs-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n@media(max-width:480px){.dhs-setting{gap:12px;padding:12px}.dhs-switch-area{flex-direction:column;gap:0}.dhs-facts{grid-template-columns:minmax(0,1fr);gap:2px}.dhs-facts dd{margin-bottom:8px}.dhs-policy{flex:1 1 auto}.dhs-button{min-height:44px}}\n@media(prefers-reduced-motion:reduce){.dhs-track,.dhs-thumb,.dhs-button{transition:none}}\n";
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
