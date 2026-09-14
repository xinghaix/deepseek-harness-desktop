window.__ModuleLoader__.load({
	id: "@deepseek-ai/deepseek-harness-desktop-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const { jsx, jsxs, Fragment } = jsxRuntime;
		const STYLE_ID = "deepseek-harness-desktop-bridge";
		const CHANNEL = "/desktop-bridge";
		const stateLabels = Object.freeze({
			stopped: "未启动",
			starting: "启动中",
			running: "运行中",
			stopping: "停止中",
			failed: "启动失败"
		});
		const linkLabels = Object.freeze({
			connected: "已连接桌面端",
			reconnecting: "正在重连桌面端…",
			"desktop-not-running": "桌面端未运行"
		});

		function installStyle() {
			if (typeof document === "undefined") return;
			let style = document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`);
			if (!style) {
				style = document.createElement("style");
				style.dataset.plugin = STYLE_ID;
				style.dataset.pluginCss = STYLE_ID;
				document.head.appendChild(style);
			}
			style.textContent = `
				.dshDesktopBridge {
					color: var(--dsw-alias-label-primary);
					flex-direction: column;
					gap: 12px;
					width: 100%;
					max-width: 760px;
					display: flex;
				}
				.dshDesktopBridgeCard {
					border: .5px solid var(--dsw-alias-border-l4);
					background: var(--dsw-alias-bg-layer-3);
					border-radius: 16px;
					padding: 4px 16px 8px;
					min-width: 0;
				}
				.dshDesktopBridgeCardTitle {
					color: var(--dsw-alias-label-primary);
					font-size: 15px;
					font-weight: 700;
					line-height: 22px;
					letter-spacing: 0.01em;
					padding: 14px 0 6px;
				}
				.dshDesktopBridgeCard > .dshDesktopBridgeRow:last-child,
				.dshDesktopBridgeCard > .dshDesktopBridgeStack:last-child {
					border-bottom: none;
				}
				.dshDesktopBridgeRow {
					border-bottom: .5px solid var(--dsw-alias-border-l2);
					align-items: center;
					gap: 8px;
					padding: 16px 0;
					display: flex;
					min-width: 0;
				}
				.dshDesktopBridgeStack {
					border-bottom: .5px solid var(--dsw-alias-border-l2);
					flex-direction: column;
					gap: 12px;
					padding: 16px 0;
					display: flex;
					min-width: 0;
				}
				.dshDesktopBridgeStackMain {
					align-items: center;
					gap: 8px;
					display: flex;
					min-width: 0;
				}
				.dshDesktopBridgeRowText {
					flex-direction: column;
					flex: 1;
					gap: 4px;
					min-width: 0;
					padding-right: 48px;
					display: flex;
				}
				.dshDesktopBridgeTitle {
					color: var(--dsw-alias-label-primary);
					font-size: 14px;
					font-weight: 400;
					line-height: 22px;
				}
				.dshDesktopBridgeDesc {
					color: var(--dsw-alias-label-tertiary);
					font-size: 12px;
					font-weight: 400;
					line-height: 18px;
				}
				.dshDesktopBridgeControl {
					align-items: center;
					gap: 8px;
					display: inline-flex;
					flex: none;
					min-width: 0;
				}
				.dshDesktopBridgeStatus {
					align-items: center;
					gap: 8px;
					display: inline-flex;
					color: var(--dsw-alias-label-primary);
					font-size: 14px;
					font-weight: 400;
					line-height: 22px;
					white-space: nowrap;
				}
				.dshDesktopBridgeDot {
					width: 8px;
					height: 8px;
					border-radius: 50%;
					background: var(--dsw-alias-label-tertiary);
					flex: 0 0 auto;
				}
				.dshDesktopBridgeDot[data-state="running"],
				.dshDesktopBridgeDot[data-link="connected"] {
					background: var(--dsw-alias-state-success-primary, #18a058);
				}
				.dshDesktopBridgeDot[data-state="starting"],
				.dshDesktopBridgeDot[data-state="stopping"],
				.dshDesktopBridgeDot[data-link="reconnecting"] {
					background: var(--dsw-alias-state-warn-primary, #d99000);
				}
				.dshDesktopBridgeDot[data-state="failed"],
				.dshDesktopBridgeDot[data-link="desktop-not-running"] {
					background: var(--dsw-alias-state-error-primary, #dc4446);
				}
				.dshDesktopBridgeSelector,
				.dshDesktopBridgeActions button,
				.dshDesktopBridgePathRow button,
				.dshDesktopBridgeControl select {
					box-sizing: border-box;
					background: var(--dsw-alias-bg-module-platform);
					height: 36px;
					font: inherit;
					color: var(--dsw-alias-label-primary);
					cursor: pointer;
					border: none;
					border-radius: 18px;
					align-items: center;
					gap: 12px;
					padding: 0 14px;
					font-size: 14px;
					line-height: 22px;
					display: inline-flex;
				}
				.dshDesktopBridgeSelector:hover:not(:disabled),
				.dshDesktopBridgeActions button:hover:not(:disabled),
				.dshDesktopBridgePathRow button:hover:not(:disabled),
				.dshDesktopBridgeControl select:hover:not(:disabled) {
					background: var(--dsw-alias-interactive-bg-hover);
				}
				.dshDesktopBridgeSelector:disabled,
				.dshDesktopBridgeActions button:disabled,
				.dshDesktopBridgePathRow button:disabled,
				.dshDesktopBridgeControl select:disabled {
					cursor: default;
					opacity: .4;
				}
				.dshDesktopBridgeSelector:focus-visible,
				.dshDesktopBridgeActions button:focus-visible,
				.dshDesktopBridgePathRow button:focus-visible,
				.dshDesktopBridgeControl select:focus-visible,
				.dshDesktopBridgeInput:focus-visible {
					outline: 2px solid var(--dsw-alias-brand-primary);
					outline-offset: 1px;
				}
				.dshDesktopBridgePrimary {
					background: var(--dsw-alias-label-primary) !important;
					color: var(--dsw-alias-bg-layer-3) !important;
				}
				.dshDesktopBridgePrimary:hover:not(:disabled) {
					background: var(--dsw-alias-label-primary) !important;
					color: var(--dsw-alias-bg-layer-3) !important;
					opacity: .92;
				}
				.dshDesktopBridgeActions {
					display: flex;
					flex-wrap: wrap;
					align-items: center;
					gap: 8px;
					min-width: 0;
				}
				.dshDesktopBridgeRow:has(.dshDesktopBridgePathRow) .dshDesktopBridgeRowText {
					flex: 0 1 auto;
					padding-right: 16px;
				}
				.dshDesktopBridgeRow:has(.dshDesktopBridgeActions) .dshDesktopBridgeRowText {
					flex: 0 1 auto;
					padding-right: 16px;
				}
				.dshDesktopBridgePathRow {
					display: flex;
					align-items: center;
					gap: 8px;
					flex: 1;
					min-width: 0;
					max-width: 100%;
				}
				.dshDesktopBridgeInput {
					box-sizing: border-box;
					flex: 1;
					min-width: 0;
					height: 36px;
					font: inherit;
					font-size: 14px;
					line-height: 22px;
					color: var(--dsw-alias-label-primary);
					background: var(--dsw-alias-bg-module-platform);
					border: none;
					border-radius: 18px;
					padding: 0 14px;
				}
				.dshDesktopBridgeInput:disabled {
					color: var(--dsw-alias-label-tertiary);
					cursor: default;
				}
				.dshDesktopBridgeControl select {
					appearance: none;
					-webkit-appearance: none;
					max-width: 220px;
					padding-right: 28px;
					background-image: linear-gradient(45deg, transparent 50%, var(--dsw-alias-label-secondary) 50%), linear-gradient(135deg, var(--dsw-alias-label-secondary) 50%, transparent 50%);
					background-position: calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px);
					background-size: 5px 5px, 5px 5px;
					background-repeat: no-repeat;
				}
				.dshDesktopBridgeToggle {
					appearance: none;
					-webkit-appearance: none;
					box-sizing: border-box;
					margin: 0;
					width: 40px;
					height: 24px;
					border: none;
					border-radius: 12px;
					background: var(--dsw-alias-fill-secondary, rgba(120, 120, 128, .32));
					position: relative;
					flex: none;
					cursor: pointer;
					transition: background-color .15s ease;
				}
				.dshDesktopBridgeToggle::before {
					content: "";
					position: absolute;
					top: 2px;
					left: 2px;
					width: 20px;
					height: 20px;
					border-radius: 50%;
					background: #fff;
					box-shadow: 0 1px 3px rgba(0, 0, 0, .25);
					transition: transform .15s ease;
				}
				.dshDesktopBridgeToggle:checked {
					background: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary, #111));
				}
				.dshDesktopBridgeToggle:checked::before {
					transform: translateX(16px);
				}
				.dshDesktopBridgeToggle:disabled {
					cursor: default;
					opacity: .4;
				}
				.dshDesktopBridgeToggle:focus-visible {
					outline: 2px solid var(--dsw-alias-brand-primary);
					outline-offset: 2px;
				}
				.dshDesktopBridgePillSelect {
					position: relative;
					flex: none;
					max-width: 100%;
				}
				.dshDesktopBridgePillTrigger {
					box-sizing: border-box;
					appearance: none;
					-webkit-appearance: none;
					align-items: center;
					gap: 8px;
					height: 36px;
					max-width: 260px;
					padding: 0 12px 0 14px;
					border: none;
					border-radius: 18px;
					background: var(--dsw-alias-bg-module-platform);
					color: var(--dsw-alias-label-primary);
					font: inherit;
					font-size: 14px;
					line-height: 22px;
					cursor: pointer;
					display: inline-flex;
					white-space: nowrap;
				}
				.dshDesktopBridgePillTrigger:hover:not(:disabled) {
					background: var(--dsw-alias-interactive-bg-hover);
				}
				.dshDesktopBridgePillTrigger:disabled {
					cursor: default;
					opacity: .4;
				}
				.dshDesktopBridgePillTrigger:focus-visible {
					outline: 2px solid var(--dsw-alias-brand-primary);
					outline-offset: 1px;
				}
				.dshDesktopBridgePillLabel {
					overflow: hidden;
					text-overflow: ellipsis;
				}
				.dshDesktopBridgePillChevron {
					flex: none;
					font-size: 11px;
					line-height: 1;
					opacity: .65;
				}
				.dshDesktopBridgePillMenu {
					position: absolute;
					right: 0;
					top: calc(100% + 6px);
					z-index: 50;
					min-width: max(100%, 168px);
					padding: 6px;
					border-radius: 14px;
					background: var(--dsw-alias-bg-layer-3, #fff);
					border: .5px solid var(--dsw-alias-border-l4);
					box-shadow: 0 10px 28px rgba(0, 0, 0, .14);
				}
				.dshDesktopBridgePillOption {
					box-sizing: border-box;
					width: 100%;
					align-items: center;
					justify-content: space-between;
					gap: 16px;
					padding: 10px 12px;
					border: none;
					border-radius: 10px;
					background: transparent;
					color: var(--dsw-alias-label-primary);
					font: inherit;
					font-size: 14px;
					line-height: 22px;
					cursor: pointer;
					display: flex;
					text-align: left;
				}
				.dshDesktopBridgePillOption:hover {
					background: var(--dsw-alias-interactive-bg-hover);
				}
				.dshDesktopBridgePillCheck {
					flex: none;
					font-size: 13px;
					line-height: 1;
				}
				.dshDesktopBridgeMsg {
					margin: 12px 0 0 !important;
					font-size: 12px !important;
					line-height: 18px !important;
				}
				.dshDesktopBridgeError {
					color: var(--dsw-alias-label-error) !important;
				}
				.dshDesktopBridgeOk {
					color: var(--dsw-alias-label-secondary) !important;
				}
			
				.dshDesktopBridgeCardTitleButton {
					box-sizing: border-box;
					width: 100%;
					margin: 0;
					padding: 14px 0 6px;
					border: none;
					background: transparent;
					color: var(--dsw-alias-label-primary);
					font: inherit;
					font-size: 15px;
					font-weight: 700;
					line-height: 22px;
					letter-spacing: 0.01em;
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 8px;
					cursor: pointer;
					text-align: left;
				}
				.dshDesktopBridgeCardTitleButton:hover {
					opacity: .88;
				}
				.dshDesktopBridgeCardTitleButton:focus-visible {
					outline: 2px solid var(--dsw-alias-brand-primary);
					outline-offset: 2px;
					border-radius: 8px;
				}
				.dshDesktopBridgeCardChevron {
					flex: none;
					width: 16px;
					height: 16px;
					color: var(--dsw-alias-label-tertiary);
					transition: transform .15s ease;
				}
				.dshDesktopBridgeCardChevron[data-open="true"] {
					transform: rotate(180deg);
				}
				.dshDesktopBridgeCardBody {
					min-width: 0;
				}
				.dshDesktopBridgeCardBody[hidden] {
					display: none !important;
				}
`;
		}

		function classifyLinkError(error) {
			const code = error?.code || "";
			if (code === "desktop-bridge/desktop-not-running") return "desktop-not-running";
			if (code === "desktop-bridge/unavailable" || code === "desktop-bridge/rejected") return "reconnecting";
			return "reconnecting";
		}

		function PillSelect({ value, options, disabled, onChange }) {
			const [open, setOpen] = react.useState(false);
			const rootRef = react.useRef(null);
			const selected = options.find((item) => item.value === value) || options[0];
			react.useEffect(() => {
				if (!open) return undefined;
				const onPointer = (event) => {
					if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
				};
				const onKey = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("mousedown", onPointer);
				document.addEventListener("keydown", onKey);
				return () => {
					document.removeEventListener("mousedown", onPointer);
					document.removeEventListener("keydown", onKey);
				};
			}, [open]);
			return jsxs("div", {
				className: "dshDesktopBridgePillSelect",
				ref: rootRef,
				children: [
					jsxs("button", {
						type: "button",
						className: "dshDesktopBridgePillTrigger",
						disabled,
						"aria-haspopup": "listbox",
						"aria-expanded": open,
						onClick: () => setOpen((prev) => !prev),
						children: [
							jsx("span", { className: "dshDesktopBridgePillLabel", children: selected?.label || "" }),
							jsx("span", { className: "dshDesktopBridgePillChevron", "aria-hidden": true, children: "▾" })
						]
					}),
					open
						? jsx("div", {
							className: "dshDesktopBridgePillMenu",
							role: "listbox",
							children: options.map((item) => {
								const active = item.value === value;
								return jsxs("button", {
									type: "button",
									className: "dshDesktopBridgePillOption",
									role: "option",
									"aria-selected": active,
									onClick: () => {
										setOpen(false);
										if (item.value !== value) onChange(item.value);
									},
									children: [
										jsx("span", { children: item.label }),
										active ? jsx("span", { className: "dshDesktopBridgePillCheck", "aria-hidden": true, children: "✓" }) : null
									]
								}, item.value === "" ? "__system__" : item.value);
							})
						})
						: null
				]
			});
		}


		// dshweb maps unknown settings.section ids to IconSettingsOutline16 (same as 通用设置).
		// Swap the nav glyph for 「桌面设置」 to a distinct desktop/monitor outline in the same 16px stroke language.
		const DESKTOP_NAV_LABEL = "桌面设置";
		function desktopNavIconSVG(className) {
			const ns = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(ns, "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			// Keep host navIcon class so flex/size match sibling glyphs; draw fuller so optical weight ≈ gear.
			svg.setAttribute("class", [className, "dshDesktopBridgeNavIcon"].filter(Boolean).join(" "));
			const mk = (tag, attrs) => {
				const el = document.createElementNS(ns, tag);
				for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
				return el;
			};
			svg.appendChild(mk("rect", { x: "1.25", y: "1.5", width: "13.5", height: "9.25", rx: "1.75", stroke: "currentColor", "stroke-width": "1.5" }));
			svg.appendChild(mk("path", { d: "M5 14.25h6M8 10.75v3.5", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" }));
			return svg;
		}
		function installDesktopNavIcon() {
			if (typeof document === "undefined") return () => {};
			const paint = () => {
				const labels = document.querySelectorAll("button, [role='button'], div, span");
				for (const el of labels) {
					if ((el.textContent || "").trim() !== DESKTOP_NAV_LABEL) continue;
					const row = el.closest("button") || el.parentElement;
					if (!row) continue;
					const existing = row.querySelector("svg.dshDesktopBridgeNavIcon");
					if (existing) continue;
					const oldSvg = row.querySelector("svg");
					if (!oldSvg) continue;
					oldSvg.replaceWith(desktopNavIconSVG(oldSvg.getAttribute("class") || ""));
				}
			};
			paint();
			const obs = new MutationObserver(() => paint());
			obs.observe(document.documentElement, { childList: true, subtree: true });
			return () => obs.disconnect();
		}

		function DesktopSettingsTab({ connection }) {
			installStyle();
			const [status, setStatus] = react.useState(null);
			const [prefs, setPrefs] = react.useState(null);
			const [update, setUpdate] = react.useState(null);
			const [appVersion, setAppVersion] = react.useState("");
			const [link, setLink] = react.useState("reconnecting");
			const [message, setMessage] = react.useState("");
			const [messageKind, setMessageKind] = react.useState("error");
			const [pending, setPending] = react.useState(false);
			const [draft, setDraft] = react.useState({ executable: "", home: "", workspace: "" });
			const [pathsOpen, setPathsOpen] = react.useState(false);
			const backoffRef = react.useRef(1000);
			const timerRef = react.useRef(null);
			const linkRef = react.useRef(link);
			const draftSeededRef = react.useRef(false);
			const draftDirtyRef = react.useRef(false);
			linkRef.current = link;

			const call = react.useCallback(async (endpoint, payload, signal) => {
				const result = await connection.rpc.call(CHANNEL, endpoint, payload || {}, signal);
				if (!result.ok) {
					const err = new Error(result.error?.message || "桌面桥接调用失败");
					err.code = result.error?.code;
					throw err;
				}
				return result.value;
			}, [connection]);

			const refresh = react.useCallback(async (signal, opts = {}) => {
				const syncDraft = opts.syncDraft === true || (!draftSeededRef.current && !draftDirtyRef.current);
				const clearMessage = opts.clearMessage === true;
				try {
					const [nextStatus, nextPrefs, nextUpdate, versionPayload] = await Promise.all([
						call("status", {}, signal),
						call("prefs", {}, signal),
						call("updateStatus", {}, signal),
						call("appVersion", {}, signal)
					]);
					setStatus(nextStatus);
					setPrefs(nextPrefs);
					setUpdate(nextUpdate);
					setAppVersion(versionPayload?.version || "");
					if (syncDraft) {
						const options = nextStatus?.options || {};
						setDraft({
							executable: options.executable || "",
							home: options.home || "",
							workspace: options.workspace || ""
						});
						draftSeededRef.current = true;
						draftDirtyRef.current = false;
					}
					setLink("connected");
					backoffRef.current = 1000;
					if (clearMessage) setMessage("");
				} catch (error) {
					if (error?.name === "AbortError") return;
					setLink(classifyLinkError(error));
					setMessage(error?.message || "无法读取桌面端状态");
					setMessageKind("error");
				}
			}, [call]);

			// Stable poller: do not restart when link flips (that caused settings flash).
			react.useEffect(() => {
				const controller = new AbortController();
				const tick = () => {
					void refresh(controller.signal, { clearMessage: false }).finally(() => {
						if (controller.signal.aborted) return;
						const connectedNow = linkRef.current === "connected";
						const delay = connectedNow ? 2500 : Math.min(backoffRef.current, 15000);
						if (!connectedNow) backoffRef.current = Math.min(backoffRef.current * 1.7, 15000);
						timerRef.current = setTimeout(tick, delay);
					});
				};
				tick();
				return () => {
					controller.abort();
					if (timerRef.current) clearTimeout(timerRef.current);
				};
			}, [refresh]);

			const processStates = new Set(["stopped", "starting", "running", "stopping", "failed"]);
			const applyInvokeValue = (endpoint, value) => {
				if (!value || typeof value !== "object") return;
				// Update payloads also have `state`; never treat them as DSH process status.
				const looksLikeUpdate = value.autoCheck !== undefined || value.currentVersion !== undefined || value.latestVersion !== undefined || endpoint === "setAutoCheckUpdate" || endpoint === "checkUpdate" || endpoint === "installUpdate" || endpoint === "updateStatus";
				const looksLikePrefs = value.language !== undefined || value.confirmQuitWhenBusy !== undefined || value.trayEnabled !== undefined || value.closeToTray !== undefined || value.traySessionLimit !== undefined || value.supported !== undefined || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "prefs";
				const looksLikeStatus = !looksLikeUpdate && !looksLikePrefs && (value.options !== undefined || processStates.has(value.state) || endpoint === "status" || endpoint === "start" || endpoint === "restart" || endpoint === "stop" || endpoint === "reloadChat");
				if (looksLikeStatus) setStatus(value);
				if (looksLikePrefs) setPrefs(value);
				if (looksLikeUpdate) setUpdate(value);
				if (value.version && endpoint === "appVersion") setAppVersion(value.version);
				if (value.path) {
					const key = endpoint === "chooseExecutable" ? "executable" : endpoint === "chooseHome" ? "home" : endpoint === "chooseWorkspace" ? "workspace" : "";
					if (key) {
						setDraft((prev) => ({ ...prev, [key]: value.path }));
						draftDirtyRef.current = false;
					}
				}
			};

			// light actions must not flip the whole page into "busy/reconnecting".
			const invoke = async (endpoint, payload, okText, opts = {}) => {
				const heavy = opts.heavy === true;
				const quiet = opts.quiet === true || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "setAutoCheckUpdate";
				if (!quiet) setPending(true);
				if (!okText && !quiet) setMessage("");
				try {
					const value = await call(endpoint, payload);
					applyInvokeValue(endpoint, value);
					if (okText) {
						setMessage(okText);
						setMessageKind("ok");
					}
					setLink((prev) => (prev === "connected" ? prev : "connected"));
					if (heavy || opts.refresh === true) {
						await refresh(undefined, { clearMessage: false, syncDraft: heavy === true });
					}
				} catch (error) {
					setLink(classifyLinkError(error));
					setMessage(error?.message || "桌面管理操作失败");
					setMessageKind("error");
				} finally {
					if (!quiet) setPending(false);
				}
			};

			const state = status?.state || "stopped";
			const options = status?.options || {};
			// pending alone must not paint the page as process-busy (that was the flash).
			const busy = state === "starting" || state === "stopping" || link === "reconnecting";
			const connected = link === "connected";

			return jsxs("div", {
				className: "dshDesktopBridge",
				children: [
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: "状态" }),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "连接" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "与本机桌面端控制面的桥接状态。" })
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeControl",
									children: [
										jsxs("span", {
											className: "dshDesktopBridgeStatus",
											children: [
												jsx("span", { className: "dshDesktopBridgeDot", "data-link": link }),
												jsx("span", { children: linkLabels[link] || link })
											]
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: pending,
											onClick: () => {
												backoffRef.current = 1000;
												setLink("reconnecting");
												void refresh();
											},
											children: "重新连接"
										})
									]
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeStack",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeStackMain",
									children: [
										jsxs("div", {
											className: "dshDesktopBridgeRowText",
											children: [
												jsx("div", { className: "dshDesktopBridgeTitle", children: "DSH 进程" }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: options.executable ? `CLI：${options.executable}` : "尚未配置 CLI" }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: options.port ? `地址：http://127.0.0.1:${options.port}/` : "地址：未就绪" }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: appVersion ? `桌面端版本：${appVersion}` : "桌面端版本：—" })
											]
										}),
										jsxs("div", {
											className: "dshDesktopBridgeControl",
											children: [
												jsxs("span", {
													className: "dshDesktopBridgeStatus",
													children: [
														jsx("span", { className: "dshDesktopBridgeDot", "data-state": state }),
														jsx("span", { children: stateLabels[state] || state })
													]
												})
											]
										})
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeActions",
									children: [
										jsx("button", {
											className: "dshDesktopBridgeSelector dshDesktopBridgePrimary",
											type: "button",
											disabled: !connected || busy,
											onClick: () => void invoke("reloadChat", {
												executable: draft.executable,
												home: draft.home,
												workspace: draft.workspace
											}, state === "running" ? "已请求重启并打开 Chat" : "已请求启动并打开 Chat", { heavy: true }),
											children: state === "running" ? "重启并打开 Chat" : "启动并打开 Chat"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openManagement", {}),
											children: "打开冷启动配置"
										})
									]
								})
							]
						}),
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsxs("button", {
							type: "button",
							className: "dshDesktopBridgeCardTitleButton",
							"aria-expanded": pathsOpen,
							onClick: () => setPathsOpen((prev) => !prev),
							children: [
								jsx("span", { children: "路径" }),
								jsx("svg", {
									className: "dshDesktopBridgeCardChevron",
									"data-open": pathsOpen ? "true" : "false",
									viewBox: "0 0 16 16",
									fill: "none",
									"aria-hidden": true,
									children: jsx("path", {
										d: "M4 6.5L8 10.5L12 6.5",
										stroke: "currentColor",
										strokeWidth: "1.5",
										strokeLinecap: "round",
										strokeLinejoin: "round"
									})
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeCardBody",
							hidden: !pathsOpen,
							children: [
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsx("div", {
									className: "dshDesktopBridgeRowText",
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: "dsh 可执行文件" })
								}),
								jsxs("div", {
									className: "dshDesktopBridgePathRow",
									children: [
										jsx("input", {
											className: "dshDesktopBridgeInput",
											value: draft.executable,
											onChange: (event) => { draftDirtyRef.current = true; setDraft((prev) => ({ ...prev, executable: event.target.value })); },
											spellCheck: false,
											autoComplete: "off"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("chooseExecutable", {}, "已选择可执行文件"),
											children: "选择"
										})
									]
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsx("div", {
									className: "dshDesktopBridgeRowText",
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: "DSH Home" })
								}),
								jsxs("div", {
									className: "dshDesktopBridgePathRow",
									children: [
										jsx("input", {
											className: "dshDesktopBridgeInput",
											value: draft.home,
											onChange: (event) => { draftDirtyRef.current = true; setDraft((prev) => ({ ...prev, home: event.target.value })); },
											spellCheck: false,
											autoComplete: "off"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("chooseHome", {}, "已选择 DSH Home"),
											children: "选择"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openHome", { home: draft.home, workspace: draft.workspace }),
											children: "打开"
										})
									]
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsx("div", {
									className: "dshDesktopBridgeRowText",
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: "Chat 工作目录" })
								}),
								jsxs("div", {
									className: "dshDesktopBridgePathRow",
									children: [
										jsx("input", {
											className: "dshDesktopBridgeInput",
											value: draft.workspace,
											onChange: (event) => { draftDirtyRef.current = true; setDraft((prev) => ({ ...prev, workspace: event.target.value })); },
											spellCheck: false,
											autoComplete: "off"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("chooseWorkspace", {}, "已选择工作目录"),
											children: "选择"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openWorkspace", { home: draft.home, workspace: draft.workspace }),
											children: "打开"
										})
									]
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "应用路径并打开 Chat" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "将上方路径写入并重启 / 启动 DSH，然后打开 Chat。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("button", {
										className: "dshDesktopBridgeSelector dshDesktopBridgePrimary",
										type: "button",
										disabled: !connected || busy,
										onClick: () => void invoke("reloadChat", {
											executable: draft.executable,
											home: draft.home,
											workspace: draft.workspace
										}, "已应用路径并打开 Chat"),
										children: "应用路径并打开 Chat"
									})
								})
							]
						}),
							]
						}),
						]
					}),

					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: "偏好" }),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsx("div", {
									className: "dshDesktopBridgeRowText",
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: "界面语言" })
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx(PillSelect, {
										value: prefs?.language || "",
										disabled: !connected || pending || !prefs,
										onChange: (language) => void invoke("setLanguage", { language }),
										options: [
											{ value: "", label: "跟随系统" },
											...(prefs?.supported || [
												{ code: "zh-CN", nativeName: "简体中文" },
												{ code: "en", nativeName: "English" }
											]).map((item) => ({ value: item.code, label: item.nativeName }))
										]
									})
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "退出确认" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "仅在有会话任务正在运行时，关闭窗口或 ⌘Q / Ctrl+Q 会二次确认；空闲时直接退出。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.confirmQuitWhenBusy !== false,
										checked: prefs?.confirmQuitWhenBusy !== false,
										disabled: !connected || pending || !prefs,
										onChange: (event) => void invoke("setConfirmQuitWhenBusy", { enabled: event.target.checked })
									})
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "开启系统托盘" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "总开关。关闭后不创建托盘图标；下方「任务显示数量」与「关闭窗口到托盘」不可用。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.trayEnabled === true,
										checked: prefs?.trayEnabled === true,
										disabled: !connected || pending || !prefs,
										onChange: (event) => void invoke("setTrayEnabled", { enabled: event.target.checked })
									})
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "任务显示数量" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "需先开启系统托盘。托盘菜单中显示的最近会话条数。0 隐藏列表，最多 20 条，按最近活动排序。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeInput",
										type: "number",
										min: 0,
										max: 20,
										value: prefs?.traySessionLimit ?? 5,
										disabled: !connected || pending || !prefs || prefs?.trayEnabled !== true,
										onChange: (event) => void invoke("setTraySessionLimit", { limit: Number(event.target.value) })
									})
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "关闭窗口到托盘" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "需先开启系统托盘。开启后：点 Chat 窗口 X 会隐藏到托盘，不会退出。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.trayEnabled === true && prefs?.closeToTray === true,
										checked: prefs?.trayEnabled === true && prefs?.closeToTray === true,
										disabled: !connected || pending || !prefs || prefs?.trayEnabled !== true,
										onChange: (event) => void invoke("setCloseToTray", { enabled: event.target.checked })
									})
								})
							]
						}),
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: "更新" }),
						jsxs("div", {
							className: "dshDesktopBridgeStack",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeStackMain",
									children: [
										jsxs("div", {
											className: "dshDesktopBridgeRowText",
											children: [
												jsx("div", { className: "dshDesktopBridgeTitle", children: "更新" }),
												jsx("div", {
													className: "dshDesktopBridgeDesc",
													children: update?.latestVersion
														? `最新版本：${update.latestVersion}（当前 ${update.currentVersion || appVersion || "—"}）`
														: `当前版本：${update?.currentVersion || appVersion || "—"}`
												})
											]
										})
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeStackMain",
									children: [
										jsxs("div", {
											className: "dshDesktopBridgeRowText",
											children: [
												jsx("div", { className: "dshDesktopBridgeTitle", children: "自动检查更新" }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: "启动成功后每天自动检查更新。" })
											]
										}),
										jsx("div", {
											className: "dshDesktopBridgeControl",
											children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": update?.autoCheck !== false,
										checked: update?.autoCheck !== false,
										disabled: !connected || pending || !update,
										onChange: (event) => void invoke("setAutoCheckUpdate", { enabled: event.target.checked })
									})
										})
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeActions",
									children: [
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("checkUpdate", {}, "已开始检查更新"),
											children: "检查更新"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector dshDesktopBridgePrimary",
											type: "button",
											disabled: !connected || pending || (update?.state !== "available" && update?.state !== "ready"),
											onClick: () => void invoke("installUpdate", {}, "已开始安装更新"),
											children: "安装更新"
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openReleasePage", {}),
											children: "发行说明"
										})
									]
								})
							]
						}),
						]
					}),
					message ? jsx("p", { className: `dshDesktopBridgeMsg ${messageKind === "ok" ? "dshDesktopBridgeOk" : "dshDesktopBridgeError"}`, role: "status", children: message }) : null
				]
			});
		}

		/** Sticky tray error ids until running again or the session becomes current. */
		const stickySessionErrors = /* @__PURE__ */ new Set();

		function markStickySessionError(sessionId) {
			const id = String(sessionId || "").trim();
			if (!id) return false;
			if (stickySessionErrors.has(id)) return false;
			stickySessionErrors.add(id);
			return true;
		}

		function sessionsFromSnapshot(listState) {
			const byId = listState && listState.byId;
			if (!byId) return { sessions: [], clearErrors: [] };
			const clearErrors = [];
			const current = listState.current;
			if (current && stickySessionErrors.has(current)) {
				stickySessionErrors.delete(current);
				clearErrors.push(current);
			}
			const out = [];
			for (const id of Object.keys(byId)) {
				const s = byId[id];
				if (!s) continue;
				const sid = s.id || id;
				const running = Boolean(s.running);
				if (running) stickySessionErrors.delete(sid);
				const title = typeof s.title === "string" && s.title.trim()
					? s.title
					: (typeof s.displayTitle === "string" ? s.displayTitle : "");
				out.push({
					id: sid,
					title,
					updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : 0,
					running,
					error: !running && stickySessionErrors.has(sid)
				});
			}
			return { sessions: out, clearErrors };
		}

		function anySessionRunning(listState) {
			const byId = listState && listState.byId;
			if (!byId) return false;
			for (const id of Object.keys(byId)) {
				if (byId[id] && byId[id].running) return true;
			}
			return false;
		}

		const inject = ["slots", "connection", "sessions", "remote"];
		function apply(ctx) {
			installStyle();
			const stopNavIcon = installDesktopNavIcon();
			if (typeof ctx.effect === "function") {
				ctx.effect(() => () => stopNavIcon());
			}
			// First-class settings nav entry (same slot as Models / Plugins / Market).
			// Do NOT use a sticky globalThis guard: Cordis HMR disposes the fiber and
			// re-applies; a sticky flag would skip re-registration and hide 「桌面设置」
			// without restarting the desktop app (exactly after hot-updating overlay).
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "deepseek-harness-desktop",
				// Before built-in general (order 0) / models (10) / plugins (15).
				order: -10,
				label: () => "桌面设置"
			}, () => jsx(DesktopSettingsTab, { connection: ctx.connection })));

			// Official busy signal: SessionSummary.running from api-session-controller
			// (api-session/status). Push to the desktop loopback for Cmd+Q confirm.
			let lastBusy = null;
			const pushBusy = (busy) => {
				if (lastBusy === busy) return;
				lastBusy = busy;
				void ctx.connection.rpc.call(CHANNEL, "reportChatBusy", { busy }).catch(() => {});
			};
			let lastSessionsKey = null;
			const pushSessions = (payload) => {
				const key = JSON.stringify(payload);
				if (lastSessionsKey === key) return;
				lastSessionsKey = key;
				void ctx.connection.rpc.call(CHANNEL, "reportSessions", payload).catch(() => {});
			};
			const syncBusy = () => {
				try {
					const snap = typeof ctx.sessions?.list?.getSnapshot === "function"
						? ctx.sessions.list.getSnapshot()
						: null;
					pushBusy(anySessionRunning(snap));
					pushSessions(sessionsFromSnapshot(snap));
				} catch (_) { /* keep last */ }
			};
			if (ctx.remote && typeof ctx.remote.$on === "function") {
				ctx.effect(() => ctx.remote.$on("api-session/error", (sessionId) => {
					if (markStickySessionError(sessionId)) syncBusy();
				}));
			}
			if (ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.subscribe === "function") {
				ctx.effect(() => {
					syncBusy();
					return ctx.sessions.list.subscribe(syncBusy);
				});
			}
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
