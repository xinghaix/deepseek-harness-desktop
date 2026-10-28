window.__ModuleLoader__.load({
  id: "dsh-prompts",
  factory: (require) => {
    const React = require("react");
    const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
    const { Modal } = require("@deepseek-ai/dsh-client-ui-primitives");
    const model = __PROMPTS_MODEL__;
    const locales = __PROMPTS_LOCALES__;
    const h = React.createElement;

    const NS = "dsh-prompts";
    const SECTION_ID = "dsh-prompts";
    const PANEL_ID = "dsh-prompts";
    const BUNDLE_KEY = "dsh-prompts";
    const ROW_KEY = "dsh-prompts#dsh-prompts";
    const STATE_PATH = "/api/dsh-prompts/state";
    const ACTION_PATH = "/api/dsh-prompts/action";
    const STYLE_TAG_ID = "dsh-prompts/PromptsManager.css";

    const CSS_TEXT = [
      ".dsh-prompts-root{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;box-sizing:border-box}",
      ".dsh-prompts-root[data-variant=settings]{max-width:760px;padding:2px 0 24px}",
      ".dsh-prompts-root[data-variant=bundle]{max-width:960px;padding:4px 0 24px}",
      ".dsh-prompts-root[data-variant=main]{max-width:960px;margin:0 auto;padding:24px 28px;width:100%}",
      ".dsh-prompts-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}",
      ".dsh-prompts-heading{margin:0;font-size:18px;font-weight:600;line-height:26px;color:var(--dsw-alias-label-primary)}",
      ".dsh-prompts-desc{margin:4px 0 0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}",
      ".dsh-prompts-live{display:inline-flex;align-items:center;gap:7px;margin-top:8px;padding:4px 10px;border-radius:999px;font-size:12px;line-height:18px;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}",
      ".dsh-prompts-live-dot{width:7px;height:7px;border-radius:50%;background:#10B981;flex:none}",
      ".dsh-prompts-live-dot[data-off=true]{background:var(--dsw-alias-label-tertiary)}",
      ".dsh-prompts-tabs{display:flex;align-items:flex-end;gap:22px;border-bottom:0.5px solid var(--dsw-alias-border-l2);margin-top:2px}",
      ".dsh-prompts-tab{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:transparent;border:0;padding:7px 2px 9px;font-size:13px;line-height:20px;position:relative;font-weight:500}",
      ".dsh-prompts-tab:hover,.dsh-prompts-tab[data-active=true]{color:var(--dsw-alias-label-primary)}",
      ".dsh-prompts-tab[data-active=true]::after{background:var(--dsw-alias-label-primary);content:'';border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-0.5px;left:0;right:0}",
      ".dsh-prompts-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
      ".dsh-prompts-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
      ".dsh-prompts-btn{font:inherit;font-size:13px;line-height:18px;padding:6px 12px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity .15s}",
      ".dsh-prompts-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2))}",
      ".dsh-prompts-btn:disabled{opacity:0.45;cursor:not-allowed}",
      ".dsh-prompts-btn[data-variant=primary]{background:var(--dsw-alias-state-business-primary,#2563EB);border-color:transparent;color:#FFFFFF;font-weight:500}",
      ".dsh-prompts-btn[data-variant=danger]{color:#EF4444;border-color:rgba(239,68,68,0.35)}",
      ".dsh-prompts-btn[data-size=sm]{padding:4px 9px;font-size:12px;border-radius:6px}",
      ".dsh-prompts-select,.dsh-prompts-input,.dsh-prompts-textarea{font:inherit;font-size:13px;line-height:20px;padding:7px 11px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-sizing:border-box}",
      ".dsh-prompts-textarea{width:100%;min-height:160px;resize:vertical;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;line-height:19px}",
      ".dsh-prompts-card{display:flex;flex-direction:column;gap:8px;padding:13px 15px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-layer-2))}",
      ".dsh-prompts-card[data-disabled=true]{opacity:0.62}",
      ".dsh-prompts-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}",
      ".dsh-prompts-card-title{font-weight:600;font-size:14px;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}",
      ".dsh-prompts-badge{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;font-size:11.5px;line-height:18px;font-weight:500;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}",
      ".dsh-prompts-badge[data-tone=accent]{color:var(--dsw-alias-state-business-primary,#3B82F6);border-color:currentColor}",
      ".dsh-prompts-badge[data-tone=current]{color:#10B981;border-color:rgba(16,185,129,0.4)}",
      ".dsh-prompts-pre{margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-2));border:0.5px solid var(--dsw-alias-border-l2);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);max-height:220px;overflow:auto}",
      ".dsh-prompts-preview-box{max-height:420px}",
      ".dsh-prompts-ws-bar{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}",
      ".dsh-prompts-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
      ".dsh-prompts-pill{font:inherit;font-size:12px;padding:3px 10px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,transparent);color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:5px}",
      ".dsh-prompts-pill[data-active=true]{background:var(--dsw-alias-state-business-primary,#2563EB);color:#FFFFFF;border-color:transparent}",
      ".dsh-prompts-empty{padding:26px 18px;text-align:center;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);margin:0}",
      ".dsh-prompts-error{padding:9px 12px;border-radius:8px;border:0.5px solid rgba(239,68,68,0.45);background:rgba(239,68,68,0.08);color:#EF4444;margin:0;font-size:12.5px}",
    ].join("\n");

    function ensureStyleTag() {
      if (typeof document === "undefined") return;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`)) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = NS;
      tag.dataset.pluginCss = STYLE_TAG_ID;
      tag.textContent = CSS_TEXT;
      (document.head || document.documentElement).appendChild(tag);
    }

    function fillTemplate(text, params) {
      if (!params || typeof text !== "string") return String(text ?? "");
      return text.replace(/\{(\w+)\}/g, (_, key) =>
        params[key] !== undefined && params[key] !== null ? String(params[key]) : `{${key}}`
      );
    }

    function createTranslator(ctx, propT) {
      return (key, params) => {
        if (typeof propT === "function") {
          try {
            const direct = propT(key, params);
            if (direct && direct !== key && direct !== `${NS}.${key}`) {
              return fillTemplate(direct, params);
            }
          } catch {
            // Fall through to ctx.locale or bundled dictionary.
          }
        }
        try {
          if (typeof ctx?.locale?.bind === "function") {
            const bound = ctx.locale.bind(NS);
            const resolved = typeof bound === "function" ? bound(key) : "";
            if (resolved && resolved !== key && resolved !== `${NS}.${key}`) {
              return fillTemplate(resolved, params);
            }
          }
        } catch {
          // Fall through.
        }
        const active = String(ctx?.locale?.getSnapshot?.()?.active || "zh").toLowerCase();
        const langKey = active.startsWith("zh")
          ? "zh"
          : active.slice(0, 2);
        const dict = locales[langKey] || locales.en || locales.zh || {};
        const fallback = dict[key] ?? locales.en?.[key] ?? key;
        return fillTemplate(fallback, params);
      };
    }

    function promptsNavIconSVG(className, size = 16) {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("fill", "none");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", [className, "dshPromptsNavIcon"].filter(Boolean).join(" "));
      const mk = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        return el;
      };
      svg.appendChild(
        mk("rect", {
          x: "1.75",
          y: "2",
          width: "12.5",
          height: "12",
          rx: "2.2",
          stroke: "currentColor",
          "stroke-width": "1.4",
        })
      );
      svg.appendChild(
        mk("path", {
          d: "M4.5 6L6.4 7.5L4.5 9M7.6 9H11.2M4.5 11.4H11.2",
          stroke: "currentColor",
          "stroke-width": "1.4",
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        })
      );
      return svg;
    }

    function SidebarPromptIcon() {
      return h(
        "svg",
        {
          width: 18,
          height: 18,
          viewBox: "0 0 16 16",
          fill: "none",
          "aria-hidden": "true",
        },
        h("rect", {
          x: "1.75",
          y: "2",
          width: "12.5",
          height: "12",
          rx: "2.2",
          stroke: "currentColor",
          strokeWidth: "1.4",
        }),
        h("path", {
          d: "M4.5 6L6.4 7.5L4.5 9M7.6 9H11.2M4.5 11.4H11.2",
          stroke: "currentColor",
          strokeWidth: "1.4",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        })
      );
    }

    function installPromptsNavIcon(getLabels) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
        return () => {};
      }
      const paint = () => {
        const accepted = new Set(
          [
            ...(typeof getLabels === "function" ? getLabels() : []),
            ...Object.values(locales).map((dict) => dict?.navTitle).filter(Boolean),
          ].map((s) => String(s).trim())
        );
        const candidates = document.querySelectorAll("button, [role='button'], span, div");
        for (const el of candidates) {
          const txt = (el.textContent || "").trim();
          if (!accepted.has(txt)) continue;
          const row = el.closest("button") || el.parentElement;
          if (!row) continue;
          if (row.querySelector("svg.dshPromptsNavIcon")) continue;
          const oldSvg = row.querySelector("svg");
          if (!oldSvg) continue;
          oldSvg.replaceWith(promptsNavIconSVG(oldSvg.getAttribute("class") || "", 16));
        }
      };
      paint();
      const obs = new MutationObserver(() => paint());
      obs.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      return () => obs.disconnect();
    }

    async function requestApi(path, body, fetchImpl) {
      const fn = fetchImpl || (typeof fetch === "function" ? fetch : null);
      if (!fn) throw new Error("fetch unavailable");
      const response = await fn(
        path,
        body === undefined
          ? { method: "GET", credentials: "same-origin", cache: "no-store" }
          : {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "content-type": "application/json",
                "x-dsh-prompts-action": "1",
              },
              body: JSON.stringify(body),
            }
      );
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok || data?.ok === false) {
        const err = new Error(data?.message || data?.code || `HTTP ${response.status}`);
        err.code = data?.code || "";
        err.payload = data;
        throw err;
      }
      return data;
    }

    function resolveCurrentWorkspacePath(services, hostWorkspaces, clientWorkspaces) {
      try {
        const sessionsSnap = services?.sessions?.list?.getSnapshot?.();
        const activeId =
          sessionsSnap?.activeSessionId ||
          sessionsSnap?.currentSessionId ||
          sessionsSnap?.selectedSessionId ||
          "";
        const allWs = [
          ...(Array.isArray(clientWorkspaces) ? clientWorkspaces : []),
          ...(Array.isArray(hostWorkspaces) ? hostWorkspaces : []),
        ];
        if (activeId) {
          for (const ws of allWs) {
            if (Array.isArray(ws?.sessionIds) && ws.sessionIds.includes(activeId)) {
              return model.normalizePath(ws.path);
            }
          }
        }
        const items = sessionsSnap?.items || [];
        if (items.length > 0) {
          const first = items[0];
          if (first?.cwd) return model.normalizePath(first.cwd);
          const firstId = first?.sessionId || first?.id;
          if (firstId) {
            for (const ws of allWs) {
              if (Array.isArray(ws?.sessionIds) && ws.sessionIds.includes(firstId)) {
                return model.normalizePath(ws.path);
              }
            }
          }
        }
      } catch {
        // Ignore session inspection error.
      }
      return "";
    }

    function createController(options = {}) {
      let services = null;
      let state = model.defaultState();
      let hostWorkspaces = [];
      let loading = false;
      let saving = false;
      let error = "";
      let activeTab = "global";
      let selectedWorkspacePath = "";
      let previewWorkspacePath = "__current__";
      let editorModal = null;
      let confirmModal = null;
      const listeners = new Set();

      const getClientWorkspaces = () => {
        const snap = services?.workspaces?.list?.getSnapshot?.();
        return Array.isArray(snap?.items) ? snap.items : [];
      };

      const buildSnapshot = () => {
        const clientWs = getClientWorkspaces();
        const combinedDshWs = [...clientWs];
        const seenPaths = new Set(clientWs.map((w) => model.pathKey(model.normalizePath(w?.path))));
        for (const hw of hostWorkspaces) {
          const key = model.pathKey(model.normalizePath(hw?.path));
          if (key && !seenPaths.has(key)) {
            seenPaths.add(key);
            combinedDshWs.push(hw);
          }
        }
        const currentCwd = resolveCurrentWorkspacePath(services, hostWorkspaces, clientWs);
        const workspaceCatalog = model.mergeWorkspaceCatalog(
          combinedDshWs,
          state.workspaces,
          currentCwd
        );

        let effectiveSelectedPath = model.normalizePath(selectedWorkspacePath);
        if (
          !effectiveSelectedPath ||
          !workspaceCatalog.some((w) => model.pathKey(w.path) === model.pathKey(effectiveSelectedPath))
        ) {
          const currentEntry = workspaceCatalog.find((w) => w.isCurrent);
          effectiveSelectedPath = currentEntry?.path || workspaceCatalog[0]?.path || "";
        }

        const selectedWorkspace =
          workspaceCatalog.find((w) => model.pathKey(w.path) === model.pathKey(effectiveSelectedPath)) ||
          null;

        const targetPreviewCwd =
          previewWorkspacePath === "__global__"
            ? ""
            : previewWorkspacePath === "__current__"
              ? effectiveSelectedPath || currentCwd
              : previewWorkspacePath;

        const preview = model.renderEffectivePreview(state, targetPreviewCwd);
        const summary = model.summaryCounts(state);

        return {
          state,
          summary,
          loading,
          saving,
          error,
          activeTab,
          currentCwd,
          workspaceCatalog,
          selectedWorkspacePath: effectiveSelectedPath,
          selectedWorkspace,
          previewWorkspacePath,
          previewTargetCwd: targetPreviewCwd,
          preview,
          editorModal,
          confirmModal,
        };
      };

      const store = createSnapshotStore(buildSnapshot());

      const publish = () => {
        const next = buildSnapshot();
        store.set(next);
        for (const fn of [...listeners]) {
          try {
            fn(next);
          } catch {
            // Listener isolation.
          }
        }
      };

      const controller = {
        subscribe: store.subscribe.bind(store),
        getSnapshot: store.getSnapshot.bind(store),
        onStateChange(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        attach(nextServices) {
          services = { ...(services || {}), ...(nextServices || {}) };
          publish();
        },
        detach(keys) {
          if (!services || !Array.isArray(keys)) {
            services = null;
          } else {
            const copy = { ...services };
            for (const k of keys) delete copy[k];
            services = copy;
          }
          publish();
        },
        sync: publish,
        setTab(tab) {
          activeTab = tab;
          error = "";
          publish();
        },
        selectWorkspace(wsPath) {
          selectedWorkspacePath = model.normalizePath(wsPath);
          error = "";
          publish();
        },
        setPreviewWorkspace(wsPath) {
          previewWorkspacePath = wsPath;
          publish();
        },
        openEditor(config) {
          const scope = config?.scope === "workspace" ? "workspace" : "global";
          const item = config?.item || null;
          editorModal = {
            scope,
            workspacePath: scope === "workspace" ? model.normalizePath(config.workspacePath || store.getSnapshot().selectedWorkspacePath) : "",
            workspaceTitle: config?.workspaceTitle || store.getSnapshot().selectedWorkspace?.title || "",
            id: item?.id || "",
            title: item?.title || config?.defaultTitle || "",
            content: item?.content || config?.defaultContent || "",
            position: item?.position || config?.defaultPosition || "suffix",
            enabled: item ? item.enabled !== false : true,
            validationError: "",
          };
          publish();
        },
        updateEditor(patch) {
          if (!editorModal) return;
          editorModal = { ...editorModal, ...patch, validationError: "" };
          publish();
        },
        applyTemplateToEditor(template) {
          if (!editorModal || !template) return;
          editorModal = {
            ...editorModal,
            title: editorModal.title.trim() ? editorModal.title : template.title,
            content: template.content,
            position: template.position || "suffix",
            validationError: "",
          };
          publish();
        },
        closeEditor() {
          editorModal = null;
          publish();
        },
        openConfirm(config) {
          confirmModal = config;
          publish();
        },
        closeConfirm() {
          confirmModal = null;
          publish();
        },
        async load() {
          loading = true;
          error = "";
          publish();
          try {
            const data = await requestApi(STATE_PATH, undefined, options.fetch);
            if (data?.state) state = model.normalizeState(data.state);
            if (Array.isArray(data?.workspaces)) hostWorkspaces = data.workspaces;
          } catch (err) {
            error = String(err?.message || err);
          } finally {
            loading = false;
            publish();
          }
        },
        async mutate(action) {
          if (saving) return false;
          const prev = state;
          try {
            state = model.applyMutation(state, action);
          } catch (err) {
            error = String(err?.message || err);
            publish();
            return false;
          }
          saving = true;
          error = "";
          publish();
          try {
            const data = await requestApi(ACTION_PATH, action, options.fetch);
            if (data?.state) state = model.normalizeState(data.state);
            if (Array.isArray(data?.workspaces)) hostWorkspaces = data.workspaces;
            saving = false;
            publish();
            return true;
          } catch (err) {
            state = prev;
            saving = false;
            error = String(err?.message || err);
            publish();
            return false;
          }
        },
        async saveEditor(t) {
          if (!editorModal) return false;
          const title = String(editorModal.title || "").trim();
          const content = String(editorModal.content || "").trim();
          if (!title) {
            editorModal = { ...editorModal, validationError: t("errorTitleRequired") };
            publish();
            return false;
          }
          if (!content) {
            editorModal = { ...editorModal, validationError: t("errorContentRequired") };
            publish();
            return false;
          }
          const itemPayload = {
            ...(editorModal.id ? { id: editorModal.id } : {}),
            title,
            content,
            position: editorModal.position,
            enabled: editorModal.enabled !== false,
          };
          const action =
            editorModal.scope === "workspace"
              ? {
                  type: "upsertWorkspaceItem",
                  workspacePath: editorModal.workspacePath,
                  workspaceTitle: editorModal.workspaceTitle,
                  item: itemPayload,
                }
              : {
                  type: "upsertGlobalItem",
                  item: itemPayload,
                };
          editorModal = null;
          return controller.mutate(action);
        },
        async pickAndSelectDirectory() {
          const uiWs = services?.uiWorkspace;
          if (!uiWs || typeof uiWs.pickDirectory !== "function") return;
          try {
            const picked = await uiWs.pickDirectory();
            const rawPath = typeof picked === "string" ? picked : picked?.path || "";
            const norm = model.normalizePath(rawPath);
            if (!norm) return;
            if (typeof services?.workspaces?.create === "function") {
              try {
                await services.workspaces.create({ path: norm });
              } catch {
                // Directory can still be configured even if workspace registration is skipped.
              }
            }
            selectedWorkspacePath = norm;
            await controller.mutate({
              type: "setWorkspacePolicy",
              workspacePath: norm,
              workspaceTitle: model.pathBaseName(norm),
              enabled: true,
            });
          } catch {
            // User cancelled picker.
          }
        },
      };

      return controller;
    }

    function useControllerState(controller) {
      return React.useSyncExternalStore(
        controller.subscribe,
        controller.getSnapshot,
        controller.getSnapshot
      );
    }

    function PromptCard({ item, index, total, scope, workspacePath, controller, saving, t }) {
      const isPrefix = item.position === "prefix";
      const onToggle = () => {
        void controller.mutate(
          scope === "workspace"
            ? { type: "toggleWorkspaceItem", workspacePath, id: item.id, enabled: !item.enabled }
            : { type: "toggleGlobalItem", id: item.id, enabled: !item.enabled }
        );
      };
      const onMove = (direction) => {
        void controller.mutate(
          scope === "workspace"
            ? { type: "moveWorkspaceItem", workspacePath, id: item.id, direction }
            : { type: "moveGlobalItem", id: item.id, direction }
        );
      };
      const onEdit = () => {
        controller.openEditor({ scope, workspacePath, item });
      };
      const onDelete = () => {
        controller.openConfirm({
          title: t("confirmDeleteItemTitle", { title: item.title }),
          body: t("confirmDeleteItemBody"),
          action:
            scope === "workspace"
              ? { type: "deleteWorkspaceItem", workspacePath, id: item.id }
              : { type: "deleteGlobalItem", id: item.id },
        });
      };

      return h(
        "div",
        {
          className: "dsh-prompts-card",
          "data-disabled": item.enabled === false ? "true" : "false",
          "data-prompt-id": item.id,
        },
        h(
          "div",
          { className: "dsh-prompts-card-head" },
          h(
            "div",
            { className: "dsh-prompts-card-title" },
            h("span", null, `#${index + 1} ${item.title}`),
            h(
              "span",
              { className: "dsh-prompts-badge", "data-tone": isPrefix ? "default" : "accent" },
              isPrefix ? t("positionPrefixBadge") : t("positionSuffixBadge")
            ),
            h(
              "span",
              { className: "dsh-prompts-badge" },
              item.enabled !== false ? t("enabled") : t("disabled")
            )
          ),
          h(
            "div",
            { className: "dsh-prompts-actions" },
            h(
              "label",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  marginRight: 4,
                },
              },
              h("input", {
                type: "checkbox",
                checked: item.enabled !== false,
                disabled: saving,
                onChange: onToggle,
              }),
              h("span", null, item.enabled !== false ? t("enabled") : t("disabled"))
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-size": "sm",
                disabled: saving || index === 0,
                onClick: () => onMove("up"),
                title: t("moveUp"),
              },
              "↑"
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-size": "sm",
                disabled: saving || index >= total - 1,
                onClick: () => onMove("down"),
                title: t("moveDown"),
              },
              "↓"
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-size": "sm",
                disabled: saving,
                onClick: onEdit,
              },
              t("edit")
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-size": "sm",
                "data-variant": "danger",
                disabled: saving,
                onClick: onDelete,
              },
              t("delete")
            )
          )
        ),
        h("pre", { className: "dsh-prompts-pre" }, item.content)
      );
    }

    function ScopeToolbar({ scope, workspace, itemCount, controller, saving, t }) {
      const templates = model.getTemplates(t);
      const workspacePath = workspace?.path || "";
      const workspaceTitle = workspace?.title || "";

      const onAddBlank = () => {
        controller.openEditor({ scope, workspacePath, workspaceTitle });
      };

      const onTemplateSelect = (event) => {
        const tplId = event.target.value;
        event.target.value = "";
        const found = templates.find((tpl) => tpl.id === tplId);
        if (!found) return;
        controller.openEditor({
          scope,
          workspacePath,
          workspaceTitle,
          defaultTitle: found.title,
          defaultContent: found.content,
          defaultPosition: found.position,
        });
      };

      const onClearAll = () => {
        controller.openConfirm(
          scope === "workspace"
            ? {
                title: t("confirmClearWorkspaceTitle", { workspace: workspaceTitle || workspacePath }),
                body: t("confirmClearWorkspaceBody"),
                action: { type: "clearWorkspaceItems", workspacePath },
              }
            : {
                title: t("confirmClearGlobalTitle"),
                body: t("confirmClearGlobalBody"),
                action: { type: "clearGlobalItems" },
              }
        );
      };

      return h(
        "div",
        { className: "dsh-prompts-toolbar" },
        h(
          "div",
          { className: "dsh-prompts-actions" },
          h(
            "button",
            {
              type: "button",
              className: "dsh-prompts-btn",
              "data-variant": "primary",
              "data-action": `add-${scope}`,
              disabled: saving || (scope === "workspace" && !workspacePath),
              onClick: onAddBlank,
            },
            "+ " + t("addPrompt")
          ),
          h(
            "select",
            {
              className: "dsh-prompts-select",
              "aria-label": t("insertTemplate"),
              value: "",
              disabled: saving || (scope === "workspace" && !workspacePath),
              onChange: onTemplateSelect,
            },
            h("option", { value: "" }, t("insertTemplate")),
            templates.map((tpl) => h("option", { key: tpl.id, value: tpl.id }, tpl.label))
          )
        ),
        itemCount > 0
          ? h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-variant": "danger",
                "data-action": `clear-${scope}`,
                disabled: saving,
                onClick: onClearAll,
              },
              t("clearAll")
            )
          : null
      );
    }

    function GlobalTabView({ snap, controller, t }) {
      const items = snap.state.globalItems || [];
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 12 } },
        h(ScopeToolbar, {
          scope: "global",
          itemCount: items.length,
          controller,
          saving: snap.saving,
          t,
        }),
        items.length === 0
          ? h("p", { className: "dsh-prompts-empty" }, t("emptyGlobal"))
          : items.map((item, index) =>
              h(PromptCard, {
                key: item.id,
                item,
                index,
                total: items.length,
                scope: "global",
                workspacePath: "",
                controller,
                saving: snap.saving,
                t,
              })
            )
      );
    }

    function WorkspaceTabView({ snap, controller, canPickDir, t }) {
      const catalog = snap.workspaceCatalog || [];
      const selected = snap.selectedWorkspace;
      const configuredList = catalog.filter((w) => w.configuredCount > 0);
      const items = selected?.items || [];

      if (catalog.length === 0) {
        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 12 } },
          h("p", { className: "dsh-prompts-empty" }, t("noWorkspaces")),
          canPickDir
            ? h(
                "div",
                null,
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-prompts-btn",
                    onClick: () => void controller.pickAndSelectDirectory(),
                  },
                  t("pickDirectory")
                )
              )
            : null
        );
      }

      const onToggleWorkspaceEnabled = (event) => {
        if (!selected) return;
        void controller.mutate({
          type: "setWorkspacePolicy",
          workspacePath: selected.path,
          workspaceId: selected.workspaceId,
          workspaceTitle: selected.title,
          enabled: event.target.checked,
        });
      };

      const onChangeMergeMode = (event) => {
        if (!selected) return;
        void controller.mutate({
          type: "setWorkspacePolicy",
          workspacePath: selected.path,
          workspaceId: selected.workspaceId,
          workspaceTitle: selected.title,
          mergeMode: event.target.value,
        });
      };

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 12 } },
        h(
          "div",
          { className: "dsh-prompts-ws-bar" },
          h(
            "div",
            { className: "dsh-prompts-toolbar" },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 } },
              h(
                "label",
                { style: { fontWeight: 600, fontSize: 12.5 } },
                t("selectWorkspace") + ":"
              ),
              h(
                "select",
                {
                  className: "dsh-prompts-select",
                  "data-workspace-select": "",
                  style: { minWidth: 260, flex: 1 },
                  value: selected?.path || "",
                  onChange: (event) => controller.selectWorkspace(event.target.value),
                },
                catalog.map((ws) =>
                  h(
                    "option",
                    { key: ws.path, value: ws.path },
                    `${ws.isCurrent ? "★ " : ""}${ws.title} (${ws.activeCount}/${ws.configuredCount}) — ${ws.path}`
                  )
                )
              ),
              selected?.isCurrent
                ? h(
                    "span",
                    { className: "dsh-prompts-badge", "data-tone": "current" },
                    t("currentSessionBadge")
                  )
                : null,
              canPickDir
                ? h(
                    "button",
                    {
                      type: "button",
                      className: "dsh-prompts-btn",
                      "data-size": "sm",
                      onClick: () => void controller.pickAndSelectDirectory(),
                    },
                    t("pickDirectory")
                  )
                : null
            )
          ),
          configuredList.length > 0
            ? h(
                "div",
                { className: "dsh-prompts-pills" },
                h(
                  "span",
                  { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } },
                  t("configuredWorkspaces") + ":"
                ),
                configuredList.map((ws) =>
                  h(
                    "button",
                    {
                      key: ws.path,
                      type: "button",
                      className: "dsh-prompts-pill",
                      "data-active": ws.path === selected?.path ? "true" : "false",
                      onClick: () => controller.selectWorkspace(ws.path),
                    },
                    `${ws.title} (${ws.activeCount})`,
                    ws.mergeMode === "override"
                      ? h(
                          "span",
                          { style: { opacity: 0.85, fontSize: 11 } },
                          `[${t("mergeOverrideShort")}]`
                        )
                      : null
                  )
                )
              )
            : null,
          selected
            ? h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    paddingTop: 6,
                    borderTop: "0.5px solid var(--dsw-alias-border-l2)",
                  },
                },
                h(
                  "label",
                  {
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      cursor: "pointer",
                      fontSize: 12.5,
                    },
                  },
                  h("input", {
                    type: "checkbox",
                    checked: selected.enabled !== false,
                    disabled: snap.saving,
                    onChange: onToggleWorkspaceEnabled,
                  }),
                  h("span", null, t("workspaceEnabled"))
                ),
                h(
                  "div",
                  { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
                  h(
                    "label",
                    { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" } },
                    t("mergeModeLabel") + ":"
                  ),
                  h(
                    "select",
                    {
                      className: "dsh-prompts-select",
                      "data-merge-mode": "",
                      value: selected.mergeMode || "append",
                      disabled: snap.saving,
                      onChange: onChangeMergeMode,
                    },
                    h("option", { value: "append" }, t("mergeAppend")),
                    h("option", { value: "override" }, t("mergeOverride"))
                  )
                )
              )
            : null
        ),
        h(ScopeToolbar, {
          scope: "workspace",
          workspace: selected,
          itemCount: items.length,
          controller,
          saving: snap.saving,
          t,
        }),
        items.length === 0
          ? h("p", { className: "dsh-prompts-empty" }, t("emptyWorkspace"))
          : items.map((item, index) =>
              h(PromptCard, {
                key: item.id,
                item,
                index,
                total: items.length,
                scope: "workspace",
                workspacePath: selected?.path || "",
                controller,
                saving: snap.saving,
                t,
              })
            )
      );
    }

    function PreviewAndOptionsTabView({ snap, controller, t }) {
      const catalog = snap.workspaceCatalog || [];
      const preview = snap.preview;
      const state = snap.state;

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 16 } },
        h(
          "div",
          { className: "dsh-prompts-card" },
          h(
            "div",
            { className: "dsh-prompts-toolbar" },
            h("strong", { style: { fontSize: 13.5 } }, t("previewScopeLabel")),
            h(
              "select",
              {
                className: "dsh-prompts-select",
                value: snap.previewWorkspacePath,
                onChange: (event) => controller.setPreviewWorkspace(event.target.value),
              },
              h(
                "option",
                { value: "__current__" },
                snap.selectedWorkspace
                  ? `${snap.selectedWorkspace.title} (${snap.selectedWorkspace.path})`
                  : t("previewGlobalOnly")
              ),
              h("option", { value: "__global__" }, t("previewGlobalOnly")),
              catalog.map((ws) =>
                h("option", { key: ws.path, value: ws.path }, `${ws.title} — ${ws.path}`)
              )
            )
          ),
          h(
            "p",
            { style: { margin: "2px 0 4px", color: "var(--dsw-alias-label-tertiary)", fontSize: 12.5 } },
            t("previewHint")
          ),
          preview.hasActive
            ? h(
                "pre",
                { className: "dsh-prompts-pre dsh-prompts-preview-box", "data-preview-envelope": "" },
                preview.combinedText
              )
            : h("p", { className: "dsh-prompts-empty" }, t("previewEmpty"))
        ),
        h(
          "div",
          { className: "dsh-prompts-card" },
          h("strong", { style: { fontSize: 13.5 } }, t("optionsHeading")),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: state.showInSettings !== false,
              disabled: snap.saving,
              onChange: (event) =>
                void controller.mutate({
                  type: "setOptions",
                  showInSettings: event.target.checked,
                }),
            }),
            h("span", null, t("optShowInSettings"))
          ),
          h(
            "label",
            { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
            h("input", {
              type: "checkbox",
              checked: state.showInSidebar === true,
              disabled: snap.saving,
              onChange: (event) =>
                void controller.mutate({
                  type: "setOptions",
                  showInSidebar: event.target.checked,
                }),
            }),
            h("span", null, t("optShowInSidebar"))
          )
        )
      );
    }

    function EditorModalView({ modal, saving, controller, t }) {
      if (!modal) return null;
      const templates = model.getTemplates(t);
      const isEdit = Boolean(modal.id);
      const heading =
        modal.scope === "workspace"
          ? t(isEdit ? "modalEditWorkspace" : "modalAddWorkspace", {
              workspace: modal.workspaceTitle || model.pathBaseName(modal.workspacePath),
            })
          : t(isEdit ? "modalEditGlobal" : "modalAddGlobal");

      return h(
        Modal,
        {
          open: true,
          onOpenChange: (open) => {
            if (!open) controller.closeEditor();
          },
          title: heading,
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 12, minWidth: 480, maxWidth: "100%" } },
          h("h3", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, heading),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 5 } },
            h(
              "label",
              { style: { fontSize: 12.5, color: "var(--dsw-alias-label-secondary)" } },
              t("templatePickerLabel")
            ),
            h(
              "select",
              {
                className: "dsh-prompts-select",
                value: "",
                onChange: (event) => {
                  const found = templates.find((tpl) => tpl.id === event.target.value);
                  event.target.value = "";
                  if (found) controller.applyTemplateToEditor(found);
                },
              },
              h("option", { value: "" }, t("templatePickerHint")),
              templates.map((tpl) => h("option", { key: tpl.id, value: tpl.id }, tpl.label))
            )
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 5 } },
            h("label", { style: { fontSize: 12.5, fontWeight: 500 } }, t("itemTitleLabel")),
            h("input", {
              type: "text",
              className: "dsh-prompts-input",
              value: modal.title,
              placeholder: t("itemTitlePlaceholder"),
              onChange: (event) => controller.updateEditor({ title: event.target.value }),
            })
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 5 } },
            h("label", { style: { fontSize: 12.5, fontWeight: 500 } }, t("positionLabel")),
            h(
              "select",
              {
                className: "dsh-prompts-select",
                value: modal.position || "suffix",
                onChange: (event) => controller.updateEditor({ position: event.target.value }),
              },
              h("option", { value: "suffix" }, t("positionSuffix")),
              h("option", { value: "prefix" }, t("positionPrefix"))
            )
          ),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 5 } },
            h("label", { style: { fontSize: 12.5, fontWeight: 500 } }, t("itemContentLabel")),
            h("textarea", {
              className: "dsh-prompts-textarea",
              value: modal.content,
              placeholder: t("itemContentPlaceholder"),
              onChange: (event) => controller.updateEditor({ content: event.target.value }),
            })
          ),
          modal.validationError
            ? h("p", { className: "dsh-prompts-error", role: "alert" }, modal.validationError)
            : null,
          h(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 } },
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                onClick: () => controller.closeEditor(),
              },
              t("cancel")
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-variant": "primary",
                disabled: saving,
                onClick: () => void controller.saveEditor(t),
              },
              saving ? t("saving") : t("save")
            )
          )
        )
      );
    }

    function ConfirmModalView({ modal, saving, controller, t }) {
      if (!modal) return null;
      return h(
        Modal,
        {
          open: true,
          onOpenChange: (open) => {
            if (!open) controller.closeConfirm();
          },
          title: modal.title,
        },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 440 } },
          h("h3", { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, modal.title),
          h("p", { style: { margin: 0, color: "var(--dsw-alias-label-secondary)" } }, modal.body),
          h(
            "div",
            { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 } },
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                onClick: () => controller.closeConfirm(),
              },
              t("cancel")
            ),
            h(
              "button",
              {
                type: "button",
                className: "dsh-prompts-btn",
                "data-variant": "danger",
                disabled: saving,
                onClick: () => {
                  const action = modal.action;
                  controller.closeConfirm();
                  if (action) void controller.mutate(action);
                },
              },
              t("confirmOk")
            )
          )
        )
      );
    }

    function PromptsManagerView({ variant = "settings", controller, ctx, propT, canPickDir }) {
      ensureStyleTag();
      const snap = useControllerState(controller);
      const t = createTranslator(ctx, propT);
      const summary = snap.summary;

      return h(
        "section",
        {
          className: "dsh-prompts-root",
          "data-variant": variant,
          "aria-label": t("title"),
        },
        h(
          "div",
          { className: "dsh-prompts-header" },
          h(
            "div",
            { style: { flex: 1, minWidth: 240 } },
            h("h2", { className: "dsh-prompts-heading" }, t("title")),
            h("p", { className: "dsh-prompts-desc" }, t("description")),
            h(
              "div",
              { className: "dsh-prompts-live" },
              h("span", {
                className: "dsh-prompts-live-dot",
                "data-off": snap.state.enabled === false ? "true" : "false",
              }),
              h("span", null, t("liveBadge"))
            )
          ),
          h(
            "label",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontWeight: 500,
                padding: "6px 12px",
                borderRadius: 8,
                border: "0.5px solid var(--dsw-alias-border-l2)",
                background: "var(--dsw-alias-bg-layer-2)",
              },
            },
            h("input", {
              type: "checkbox",
              checked: snap.state.enabled !== false,
              disabled: snap.saving,
              onChange: (event) =>
                void controller.mutate({
                  type: "setOptions",
                  enabled: event.target.checked,
                }),
            }),
            h("span", null, t("masterToggle"))
          )
        ),
        snap.error
          ? h("p", { className: "dsh-prompts-error", role: "alert" }, snap.error)
          : null,
        h(
          "div",
          { className: "dsh-prompts-tabs", role: "tablist" },
          h(
            "button",
            {
              type: "button",
              role: "tab",
              className: "dsh-prompts-tab",
              "data-tab": "global",
              "data-active": snap.activeTab === "global" ? "true" : "false",
              "aria-selected": snap.activeTab === "global",
              onClick: () => controller.setTab("global"),
            },
            t("tabGlobal", { count: summary.globalCount })
          ),
          h(
            "button",
            {
              type: "button",
              role: "tab",
              className: "dsh-prompts-tab",
              "data-tab": "workspace",
              "data-active": snap.activeTab === "workspace" ? "true" : "false",
              "aria-selected": snap.activeTab === "workspace",
              onClick: () => controller.setTab("workspace"),
            },
            t("tabWorkspace", { count: summary.workspaceCount })
          ),
          h(
            "button",
            {
              type: "button",
              role: "tab",
              className: "dsh-prompts-tab",
              "data-tab": "preview",
              "data-active": snap.activeTab === "preview" ? "true" : "false",
              "aria-selected": snap.activeTab === "preview",
              onClick: () => controller.setTab("preview"),
            },
            t("tabPreview")
          )
        ),
        snap.activeTab === "global"
          ? h(GlobalTabView, { snap, controller, t })
          : snap.activeTab === "workspace"
            ? h(WorkspaceTabView, { snap, controller, canPickDir, t })
            : h(PreviewAndOptionsTabView, { snap, controller, t }),
        h(EditorModalView, {
          modal: snap.editorModal,
          saving: snap.saving,
          controller,
          t,
        }),
        h(ConfirmModalView, {
          modal: snap.confirmModal,
          saving: snap.saving,
          controller,
          t,
        })
      );
    }

    function apply(ctx, options = {}) {
      const controller = createController(options);
      let canPickDir = false;

      ctx.effect(
        () => ctx.locale.register(NS, { zh: locales.zh, en: locales.en }),
        "dsh-prompts: zh/en dictionaries"
      );
      for (const id of ["de", "fr", "es", "ja", "ko", "pt"]) {
        ctx.effect(
          () => ctx.locale.register(NS, id, locales[id]),
          `dsh-prompts: ${id} dictionary`
        );
      }

      const t = createTranslator(ctx);

      const renderSummary = (props) => {
        const localT = createTranslator(ctx, props?.t);
        const summary = controller.getSnapshot().summary;
        return localT("bundleSummary", {
          status: localT(summary.enabled ? "statusEnabled" : "statusDisabled"),
          globalCount: summary.globalCount,
          workspaceCount: summary.workspaceCount,
        });
      };

      const BundleSlotComponent = (props) => {
        if (props?.view === "summary") {
          return renderSummary(props);
        }
        return h(PromptsManagerView, {
          variant: "bundle",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });
      };

      const SettingsSlotComponent = (props) =>
        h(PromptsManagerView, {
          variant: "settings",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });

      const MainPanelSlotComponent = (props) =>
        h(PromptsManagerView, {
          variant: "main",
          controller,
          ctx,
          propT: props?.t,
          canPickDir,
        });

      ctx.slots.inject("plugins.bundle.config", () =>
        ctx.slots.register(
          {
            name: "plugins.bundle.config",
            key: BUNDLE_KEY,
            locale: NS,
            inject: () => ({}),
          },
          BundleSlotComponent
        )
      );

      ctx.slots.inject("plugins.row.config", () =>
        ctx.slots.register(
          {
            name: "plugins.row.config",
            key: ROW_KEY,
            locale: NS,
            inject: () => ({}),
          },
          BundleSlotComponent
        )
      );

      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
            inject: () => ({}),
          },
          MainPanelSlotComponent
        )
      );

      let disposeSettingsSection = null;
      let disposeSidebarPanel = null;

      const syncDynamicSlots = () => {
        const snap = controller.getSnapshot();
        const wantSettings = snap.state.showInSettings !== false;
        const wantSidebar = snap.state.showInSidebar === true;

        if (wantSettings && !disposeSettingsSection) {
          disposeSettingsSection = ctx.slots.inject("settings.section", () =>
            ctx.slots.register(
              {
                name: "settings.section",
                id: SECTION_ID,
                order: 22,
                locale: NS,
                label: () => t("navTitle"),
                inject: () => ({}),
              },
              SettingsSlotComponent
            )
          );
        } else if (!wantSettings && disposeSettingsSection) {
          try {
            disposeSettingsSection();
          } catch {
            // Ignore disposal error.
          }
          disposeSettingsSection = null;
        }

        if (wantSidebar && !disposeSidebarPanel) {
          disposeSidebarPanel = ctx.slots.inject("sidebar.panellist", () =>
            ctx.slots.register(
              {
                name: "sidebar.panellist",
                id: PANEL_ID,
                order: 26,
                locale: NS,
                label: () => t("navTitle"),
              },
              SidebarPromptIcon
            )
          );
        } else if (!wantSidebar && disposeSidebarPanel) {
          try {
            disposeSidebarPanel();
          } catch {
            // Ignore disposal error.
          }
          disposeSidebarPanel = null;
        }
      };

      syncDynamicSlots();
      const offState = controller.onStateChange(() => syncDynamicSlots());

      let activeLocale = ctx.locale?.getSnapshot?.()?.active;
      const offLocale =
        typeof ctx.locale?.subscribe === "function"
          ? ctx.locale.subscribe(() => {
              const next = ctx.locale.getSnapshot()?.active;
              if (next !== activeLocale) {
                activeLocale = next;
                if (disposeSettingsSection) {
                  try {
                    disposeSettingsSection();
                  } catch {
                    // Ignore.
                  }
                  disposeSettingsSection = null;
                }
                if (disposeSidebarPanel) {
                  try {
                    disposeSidebarPanel();
                  } catch {
                    // Ignore.
                  }
                  disposeSidebarPanel = null;
                }
                syncDynamicSlots();
                controller.sync();
              }
            })
          : () => {};

      const offNavIcon = installPromptsNavIcon(() => [t("navTitle")]);

      if (typeof ctx.inject === "function") {
        ctx.inject(["workspaces", "sessions"], (scope) => {
          const offWs =
            typeof scope.workspaces?.list?.subscribe === "function"
              ? scope.workspaces.list.subscribe(() => controller.sync())
              : () => {};
          const offSessions =
            typeof scope.sessions?.list?.subscribe === "function"
              ? scope.sessions.list.subscribe(() => controller.sync())
              : () => {};
          controller.attach({
            workspaces: scope.workspaces,
            sessions: scope.sessions,
          });
          return () => {
            offWs();
            offSessions();
            controller.detach(["workspaces", "sessions"]);
          };
        });

        ctx.inject(["uiWorkspace"], (scope) => {
          canPickDir = typeof scope.uiWorkspace?.pickDirectory === "function";
          controller.attach({
            uiWorkspace: scope.uiWorkspace,
          });
          return () => {
            canPickDir = false;
            controller.detach(["uiWorkspace"]);
          };
        });
      }

      void controller.load();

      ctx.effect(
        () => () => {
          offState();
          offLocale();
          offNavIcon();
          if (disposeSettingsSection) {
            try {
              disposeSettingsSection();
            } catch {
              // Ignore.
            }
            disposeSettingsSection = null;
          }
          if (disposeSidebarPanel) {
            try {
              disposeSidebarPanel();
            } catch {
              // Ignore.
            }
            disposeSidebarPanel = null;
          }
        },
        "dsh-prompts: client lifecycle"
      );

      return controller;
    }

    return {
      apply,
      createController,
      inject: ["slots", "locale"],
    };
  },
});
