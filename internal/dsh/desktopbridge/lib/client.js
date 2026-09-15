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
		const SHOW_COPY_SESSION_ID_GLOBAL = "__DSH_DESKTOP_SHOW_COPY_SESSION_ID__";
		const SHOW_COPY_SESSION_ID_EVENT = "dsh-desktop-show-copy-session-id";
		if (typeof window !== "undefined" && typeof window[SHOW_COPY_SESSION_ID_GLOBAL] !== "boolean") {
			window[SHOW_COPY_SESSION_ID_GLOBAL] = true;
		}
		function publishShowCopySessionId(value) {
			if (typeof value?.showCopySessionId !== "boolean" || typeof window === "undefined") return;
			const enabled = value.showCopySessionId;
			window[SHOW_COPY_SESSION_ID_GLOBAL] = enabled;
			if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
			window.dispatchEvent(new CustomEvent(SHOW_COPY_SESSION_ID_EVENT, { detail: enabled }));
		}

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
				.dshDesktopBridgeShortcutRow {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12px;
					padding: 10px 0;
					border-bottom: 1px solid var(--dsw-alias-border-subtle, rgba(127,127,127,.18));
				}
				.dshDesktopBridgeShortcutRow:last-child { border-bottom: none; }
				.dshDesktopBridgeKbd {
					font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
					font-size: 12px;
					padding: 3px 8px;
					border-radius: 6px;
					border: 1px solid var(--dsw-alias-border-subtle, rgba(127,127,127,.28));
					background: var(--dsw-alias-bg-module-platform, rgba(127,127,127,.08));
					color: var(--dsw-alias-label-primary);
					white-space: nowrap;
					min-width: 4.5em;
					text-align: center;
					cursor: pointer;
					user-select: none;
				}
				.dshDesktopBridgeKbd:hover {
					border-color: var(--dsw-alias-brand-primary, #3b82f6);
				}
				.dshDesktopBridgeKbd.is-cleared {
					color: var(--dsw-alias-label-tertiary);
					font-style: italic;
					border-style: dashed;
				}
				.dshDesktopBridgeKbd.is-recording {
					color: var(--dsw-alias-brand-primary, #3b82f6);
					border-color: var(--dsw-alias-brand-primary, #3b82f6);
					border-style: solid;
					font-style: normal;
					box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18);
				}
				.dshDesktopBridgeShortcutActions {
					display: flex;
					align-items: center;
					gap: 8px;
					flex: none;
				}
				.dshDesktopBridgeShortcutActions button {
					height: 28px;
					padding: 0 10px;
					font-size: 12px;
					border-radius: 14px;
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
					display: block;
					width: 14px;
					height: 14px;
					color: var(--dsw-alias-label-secondary);
					transition: transform .15s ease;
				}
				.dshDesktopBridgePillChevron[data-open="true"] {
					transform: rotate(180deg);
				}
				.dshDesktopBridgeInlineKbd {
					display: inline-block;
					font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
					font-size: 12px;
					font-style: normal;
					padding: 0 6px;
					margin: 0 1px;
					border-radius: 6px;
					border: 1px solid var(--dsw-alias-border-subtle, rgba(127,127,127,.28));
					background: var(--dsw-alias-bg-module-platform, rgba(127,127,127,.08));
					line-height: 18px;
					vertical-align: 1px;
					white-space: nowrap;
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
							jsx("svg", {
								className: "dshDesktopBridgePillChevron",
								"data-open": open ? "true" : "false",
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


		// The official workspace package has no session-menu slot. Keep this extension
		// in our plugin: observe its stable menu roles, read the owning row's node.id
		// from React's host fiber, and never replace or mutate the official module.
		const COPY_SESSION_ID_MENU_ATTRIBUTE = "data-dsh-copy-session-id";
		const COPY_SESSION_ID_WRAPPER_ATTRIBUTE = "data-dsh-copy-session-id-wrapper";
		const COPY_SESSION_ID_VALUE_ATTRIBUTE = "data-dsh-copy-session-id-value";
		const COPY_SESSION_ID_LABEL_ATTRIBUTE = "data-dsh-copy-session-id-label";
		const SESSION_MENU_LABELS = Object.freeze({
			zh: Object.freeze({ rename: "重命名", fork: "分叉会话", archive: "归档会话", copy: "复制会话ID", copied: "已复制", copyFailed: "复制失败" }),
			en: Object.freeze({ rename: "Rename", fork: "Fork session", archive: "Archive session", copy: "Copy session ID", copied: "Copied", copyFailed: "Copy failed" })
		});
		const PENDING_SESSION_ID_TTL_MS = 5000;

		function reactFiberFromElement(element) {
			try {
				for (let current = element, depth = 0; current && depth < 8; current = current.parentElement, depth += 1) {
					const key = Object.getOwnPropertyNames(current).find((name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
					if (key) return current[key];
				}
			} catch (_) {
				// React internals are an optional compatibility hint; fail closed.
			}
			return undefined;
		}

		function sessionIdFromReactFiber(fiber) {
			try {
				for (let current = fiber, depth = 0; current && depth < 80; current = current.return, depth += 1) {
					const props = current.memoizedProps || current.pendingProps;
					const node = props?.node;
					if (node && typeof node.id === "string" && (typeof props.onRename === "function" || typeof props.onFork === "function" || typeof props.onArchive === "function")) {
						return node.id;
					}
				}
			} catch (_) {
				// React internals are an optional compatibility hint; fail closed.
			}
			return "";
		}

		function sessionIdFromElement(element) {
			return sessionIdFromReactFiber(reactFiberFromElement(element));
		}

		function menuLabels(menu) {
			return [...menu.querySelectorAll("button[role='menuitem']")].map((item) => (item.textContent || "").replace(/\s+/g, " ").trim());
		}

		function sessionMenuLocale(menu) {
			const labels = menuLabels(menu);
			for (const [locale, copy] of Object.entries(SESSION_MENU_LABELS)) {
				if (labels.includes(copy.rename) && labels.includes(copy.fork) && labels.includes(copy.archive)) return locale;
			}
			return "";
		}

		function copySessionIdIconSVG() {
			if (typeof document.createElementNS !== "function") return undefined;
			const ns = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(ns, "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			// Match the official IconCopyOutline16 geometry so the injected item
			// has the same visible size as Rename/Fork/Archive.
			const path = document.createElementNS(ns, "path");
			path.setAttribute("d", "M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z");
			path.setAttribute("fill", "currentColor");
			svg.appendChild(path);
			return svg;
		}

		function makeCopySessionMenuItem(template, sessionId, locale) {
			const labels = SESSION_MENU_LABELS[locale] || SESSION_MENU_LABELS.zh;
			const item = template.cloneNode(true);
			item.removeAttribute("disabled");
			item.removeAttribute("aria-haspopup");
			item.removeAttribute("aria-expanded");
			item.setAttribute(COPY_SESSION_ID_MENU_ATTRIBUTE, "");
			item.setAttribute(COPY_SESSION_ID_VALUE_ATTRIBUTE, sessionId);
			item.setAttribute("aria-label", labels.copy);
			item.__dshCopySessionIdLabels = labels;
			const spans = item.querySelectorAll("span");
			const label = spans.length > 0 ? spans[spans.length - 1] : document.createElement("span");
			if (spans.length === 0) item.appendChild(label);
			label.setAttribute(COPY_SESSION_ID_LABEL_ATTRIBUTE, "");
			label.textContent = labels.copy;
			if (spans.length > 1) {
				spans[0].textContent = "";
				spans[0].setAttribute("aria-hidden", "true");
				const icon = copySessionIdIconSVG();
				if (icon) spans[0].appendChild(icon);
			}
			item.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				copySessionIdFromMenuItem(item);
			});
			return item;
		}

		function showCopySessionIdFeedback(item, text, fallback, delay) {
			if (!item.isConnected) return;
			const label = item.querySelector(`[${COPY_SESSION_ID_LABEL_ATTRIBUTE}]`);
			if (!label) return;
			if (item.__dshCopySessionIdTimer !== undefined) window.clearTimeout(item.__dshCopySessionIdTimer);
			label.textContent = text;
			item.setAttribute("aria-label", text);
			item.__dshCopySessionIdTimer = window.setTimeout(() => {
				item.__dshCopySessionIdTimer = undefined;
				if (!item.isConnected) return;
				label.textContent = fallback;
				item.setAttribute("aria-label", fallback);
			}, delay);
		}

		function copySessionIdFromMenuItem(item) {
			const sessionId = item.getAttribute(COPY_SESSION_ID_VALUE_ATTRIBUTE) || "";
			const labels = item.__dshCopySessionIdLabels || SESSION_MENU_LABELS.zh;
			if (!sessionId || typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
				showCopySessionIdFeedback(item, labels.copyFailed, labels.copy, 1200);
				return;
			}
			let result;
			try {
				result = navigator.clipboard.writeText(sessionId);
			} catch (_) {
				showCopySessionIdFeedback(item, labels.copyFailed, labels.copy, 1200);
				return;
			}
			Promise.resolve(result).then(() => {
				showCopySessionIdFeedback(item, labels.copied, labels.copy, 1000);
			}).catch(() => {
				showCopySessionIdFeedback(item, labels.copyFailed, labels.copy, 1200);
			});
		}

		function removeCopySessionIdMenuItem(item) {
			if (!item) return;
			if (item.__dshCopySessionIdTimer !== undefined && typeof window !== "undefined" && typeof window.clearTimeout === "function") {
				window.clearTimeout(item.__dshCopySessionIdTimer);
				item.__dshCopySessionIdTimer = undefined;
			}
			const wrapper = item.parentElement?.hasAttribute(COPY_SESSION_ID_WRAPPER_ATTRIBUTE) ? item.parentElement : item;
			wrapper.remove();
		}

		function installCopySessionIdMenu() {
			if (typeof document === "undefined" || typeof document.addEventListener !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function" || !document.documentElement || typeof MutationObserver !== "function") return () => {};
			let enabled = typeof window === "undefined" || window[SHOW_COPY_SESSION_ID_GLOBAL] !== false;
			let pendingSessionId = "";
			let pendingAt = 0;
			let scheduled = false;
			const isFreshPending = () => pendingSessionId && Date.now() - pendingAt < PENDING_SESSION_ID_TTL_MS;
			const rememberSessionAction = (event) => {
				const button = event.target?.closest?.("button");
				if (!button || button.closest("[role='menu']")) return;
				const row = button.closest("[role='treeitem']");
				if (!row) return;
				const sessionId = sessionIdFromElement(button) || sessionIdFromElement(row);
				if (!sessionId) return;
				pendingSessionId = sessionId;
				pendingAt = Date.now();
			};
			const decorate = () => {
				const menus = [...document.querySelectorAll("[role='menu']")];
				for (const menu of menus) {
					const existing = menu.querySelector(`[${COPY_SESSION_ID_MENU_ATTRIBUTE}]`);
					if (!enabled) {
						removeCopySessionIdMenuItem(existing);
						continue;
					}
					const locale = sessionMenuLocale(menu);
					if (existing || !locale) continue;
					const fiberSessionId = sessionIdFromElement(menu);
					const fromPending = !fiberSessionId && isFreshPending();
					const sessionId = fiberSessionId || (fromPending ? pendingSessionId : "");
					if (!sessionId) continue;
					const items = [...menu.querySelectorAll("button[role='menuitem']")];
					const archive = items.find((item) => (item.textContent || "").replace(/\s+/g, " ").trim() === SESSION_MENU_LABELS[locale].archive);
					const template = archive || items[items.length - 1];
					if (!template) continue;
					const item = makeCopySessionMenuItem(template, sessionId, locale);
					// The opener is consumed once a matching portal menu is decorated;
					// keeping it would risk assigning a stale id to a later menu.
					pendingSessionId = "";
					pendingAt = 0;
					const templateWrapper = template.parentElement;
					const wrapper = templateWrapper?.cloneNode(false);
					if (wrapper) {
						wrapper.setAttribute(COPY_SESSION_ID_WRAPPER_ATTRIBUTE, "");
						wrapper.appendChild(item);
						if (archive?.parentElement) archive.parentElement.before(wrapper);
						else if (templateWrapper?.parentElement) templateWrapper.parentElement.appendChild(wrapper);
					} else {
						menu.appendChild(item);
					}
				}
			};
			const schedule = () => {
				if (scheduled) return;
				scheduled = true;
				const run = () => {
					scheduled = false;
					decorate();
				};
				if (typeof queueMicrotask === "function") queueMicrotask(run);
				else if (typeof window.setTimeout === "function") window.setTimeout(run, 0);
				else setTimeout(run, 0);
			};
			const onSettingChange = (event) => {
				enabled = event.detail !== false;
				schedule();
			};
			document.addEventListener("pointerdown", rememberSessionAction, true);
			document.addEventListener("click", rememberSessionAction, true);
			window.addEventListener(SHOW_COPY_SESSION_ID_EVENT, onSettingChange);
			const observer = new MutationObserver(schedule);
			observer.observe(document.documentElement, { childList: true, subtree: true });
			schedule();
			return () => {
				document.removeEventListener("pointerdown", rememberSessionAction, true);
				document.removeEventListener("click", rememberSessionAction, true);
				window.removeEventListener(SHOW_COPY_SESSION_ID_EVENT, onSettingChange);
				observer.disconnect();
				for (const item of document.querySelectorAll(`[${COPY_SESSION_ID_MENU_ATTRIBUTE}]`)) removeCopySessionIdMenuItem(item);
			};
		}

		function keyboardEventToAccelerator(event, isMac) {
			const code = event.code || "";
			const key = event.key || "";
			if (key === "Escape" || code === "Escape") return { cancel: true };
			const modifierCodes = new Set([
				"ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
				"AltLeft", "AltRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight"
			]);
			if (modifierCodes.has(code) || key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") {
				return null;
			}
			let keyToken = "";
			if (/^Key[A-Z]$/.test(code)) keyToken = code.slice(3).toLowerCase();
			else if (/^Digit[0-9]$/.test(code)) keyToken = code.slice(5);
			else if (/^Numpad[0-9]$/.test(code)) keyToken = code.slice(6);
			else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) keyToken = code;
			else {
				const codeMap = {
					Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
					Semicolon: ";", Quote: "'", Minus: "-", Equal: "=", Backquote: "`",
					Space: "Space", Tab: "Tab", Enter: "Return", NumpadEnter: "Return",
					Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
					ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
					Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
					NumpadAdd: "Plus", NumpadSubtract: "-", NumpadMultiply: "*", NumpadDivide: "/",
					NumpadDecimal: "."
				};
				if (Object.prototype.hasOwnProperty.call(codeMap, code)) keyToken = codeMap[code];
				else if (key.length === 1) {
					const ch = key.toLowerCase();
					if (/[a-z0-9]/.test(ch) || "`-=[]\\;',./".includes(ch)) keyToken = ch;
				}
			}
			if (!keyToken) return { invalid: true };
			const parts = [];
			if (isMac) {
				if (event.metaKey) parts.push("CmdOrCtrl");
				if (event.ctrlKey) parts.push("Control");
			} else if (event.ctrlKey || event.metaKey) {
				parts.push("CmdOrCtrl");
			}
			if (event.altKey) parts.push("OptionOrAlt");
			if (event.shiftKey) parts.push("Shift");
			parts.push(keyToken);
			return { accel: parts.join("+") };
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
			const [recordingShortcutId, setRecordingShortcutId] = react.useState(null);
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
					publishShowCopySessionId(nextPrefs);
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
				const looksLikePrefs = value.language !== undefined || value.confirmQuitWhenBusy !== undefined || value.trayEnabled !== undefined || value.closeToTray !== undefined || value.traySessionLimit !== undefined || value.showCopySessionId !== undefined || value.supported !== undefined || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "setShowCopySessionId" || endpoint === "setShortcuts" || endpoint === "prefs" || value.shortcuts !== undefined;
				const looksLikeStatus = !looksLikeUpdate && !looksLikePrefs && (value.options !== undefined || processStates.has(value.state) || endpoint === "status" || endpoint === "start" || endpoint === "restart" || endpoint === "stop" || endpoint === "reloadChat");
				if (looksLikeStatus) setStatus(value);
				if (looksLikePrefs) setPrefs(value);
				if (looksLikeUpdate) setUpdate(value);
				if (value.version && endpoint === "appVersion") setAppVersion(value.version);
				publishShowCopySessionId(value);
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
				const quiet = opts.quiet === true || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "setShowCopySessionId" || endpoint === "setShortcuts" || endpoint === "setAutoCheckUpdate";
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
			const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") || /Mac OS X/.test(navigator.userAgent || "");
			const DEFAULT_SHORTCUTS = {
				openSettings: "CmdOrCtrl+,",
				closeChat: "CmdOrCtrl+w",
				quit: "CmdOrCtrl+q",
				hide: "CmdOrCtrl+h",
				hideOthers: "CmdOrCtrl+OptionOrAlt+h"
			};
			const SHORTCUT_LABELS = {
				openSettings: "打开桌面设置",
				closeChat: "关闭/隐藏 Chat",
				quit: "退出",
				hide: "隐藏应用",
				hideOthers: "隐藏其他"
			};
			const formatAccel = (accel) => {
				if (accel == null || accel === "") return "";
				let s = String(accel);
				s = s.replace(/CmdOrCtrl\+/gi, isMac ? "⌘" : "Ctrl+");
				s = s.replace(/\bControl\+/gi, isMac ? "⌃" : "Ctrl+");
				s = s.replace(/OptionOrAlt\+/gi, isMac ? "⌥" : "Alt+");
				s = s.replace(/Alt\+/gi, isMac ? "⌥" : "Alt+");
				s = s.replace(/Shift\+/gi, isMac ? "⇧" : "Shift+");
				if (isMac) {
					s = s.replace(/\+/g, "");
					s = s.replace(/([a-z])$/i, (m) => m.toUpperCase());
				}
				return s;
			};
			const shortcutMap = Object.assign({}, DEFAULT_SHORTCUTS, prefs?.shortcuts || {});
			const shortcutIds = ["openSettings", "closeChat", "quit", "hide", "hideOthers"].filter((id) => {
				if (id === "hide" || id === "hideOthers") return isMac;
				return true;
			});
			const setOneShortcut = (id, value) => {
				const next = Object.assign({}, DEFAULT_SHORTCUTS, prefs?.shortcuts || {});
				next[id] = value;
				return invoke("setShortcuts", { shortcuts: next });
			};
			const normalizeAccelCompare = (accel) => String(accel || "").trim().toLowerCase();
			react.useEffect(() => {
				if (!recordingShortcutId) return undefined;
				const onKey = (event) => {
					event.preventDefault();
					event.stopPropagation();
					const parsed = keyboardEventToAccelerator(event, isMac);
					if (!parsed) return;
					if (parsed.cancel) {
						setRecordingShortcutId(null);
						return;
					}
					if (parsed.invalid || !parsed.accel) {
						setMessage("无效快捷键");
						setMessageKind("error");
						return;
					}
					const id = recordingShortcutId;
					const current = Object.assign({}, DEFAULT_SHORTCUTS, prefs?.shortcuts || {});
					const want = normalizeAccelCompare(parsed.accel);
					for (const otherId of Object.keys(current)) {
						if (otherId === id) continue;
						if (normalizeAccelCompare(current[otherId]) === want && current[otherId] !== "") {
							setMessage(`快捷键与「${SHORTCUT_LABELS[otherId] || otherId}」冲突`);
							setMessageKind("error");
							return;
						}
					}
					setRecordingShortcutId(null);
					void setOneShortcut(id, parsed.accel);
				};
				window.addEventListener("keydown", onKey, true);
				return () => window.removeEventListener("keydown", onKey, true);
			}, [recordingShortcutId, isMac, prefs]);
			react.useEffect(() => {
				if (!recordingShortcutId) return undefined;
				const onPointerDown = (event) => {
					if (event.button != null && event.button !== 0) return;
					const el = event.target;
					if (el && typeof el.closest === "function" && el.closest(".dshDesktopBridgeKbd.is-recording")) {
						return;
					}
					setRecordingShortcutId(null);
				};
				window.addEventListener("pointerdown", onPointerDown, true);
				return () => window.removeEventListener("pointerdown", onPointerDown, true);
			}, [recordingShortcutId]);
			const boundShortcutLabel = (id) => {
				const accel = Object.prototype.hasOwnProperty.call(shortcutMap, id) ? shortcutMap[id] : (DEFAULT_SHORTCUTS[id] || "");
				if (!accel) return "";
				return formatAccel(accel) || accel;
			};
			const quitShortcutLabel = boundShortcutLabel("quit");
			const closeChatShortcutLabel = boundShortcutLabel("closeChat");
			const inlineShortcut = (id, label) => jsx("kbd", { className: "dshDesktopBridgeInlineKbd", children: label }, id);
			const shortcutRows = shortcutIds.map((id) => {
				const accel = Object.prototype.hasOwnProperty.call(shortcutMap, id) ? shortcutMap[id] : DEFAULT_SHORTCUTS[id];
				const defaultAccel = DEFAULT_SHORTCUTS[id] || "";
				const cleared = accel === "";
				const isDefault = normalizeAccelCompare(accel) === normalizeAccelCompare(defaultAccel);
				const recording = recordingShortcutId === id;
				return jsxs("div", {
					className: "dshDesktopBridgeShortcutRow",
					key: id,
					children: [
						jsx("div", { className: "dshDesktopBridgeTitle", children: SHORTCUT_LABELS[id] || id }),
						jsxs("div", {
							className: "dshDesktopBridgeShortcutActions",
							children: [
								jsx("kbd", {
									className: "dshDesktopBridgeKbd" + (cleared && !recording ? " is-cleared" : "") + (recording ? " is-recording" : ""),
									role: "button",
									tabIndex: 0,
									title: "点击录制新快捷键",
									onClick: () => {
										if (!connected || pending || !prefs) return;
										setRecordingShortcutId((prev) => (prev === id ? null : id));
									},
									onKeyDown: (event) => {
										if (recordingShortcutId) return;
										if (event.key !== "Enter" && event.key !== " ") return;
										event.preventDefault();
										if (!connected || pending || !prefs) return;
										setRecordingShortcutId(id);
									},
									children: recording ? "按下新快捷键…" : (cleared ? "已清除" : (formatAccel(accel) || accel))
								}),
								jsx("button", {
									className: "dshDesktopBridgeSelector",
									type: "button",
									disabled: !connected || pending || !prefs || cleared,
									onClick: () => {
										setRecordingShortcutId(null);
										void setOneShortcut(id, "");
									},
									children: "清除"
								}),
								jsx("button", {
									className: "dshDesktopBridgeSelector",
									type: "button",
									disabled: !connected || pending || !prefs || isDefault,
									onClick: () => {
										setRecordingShortcutId(null);
										void setOneShortcut(id, defaultAccel);
									},
									children: "恢复默认"
								})
							]
						})
					]
				});
			});

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
										jsxs("div", { className: "dshDesktopBridgeDesc", children: quitShortcutLabel
											? ["仅在有会话任务正在运行时，关闭窗口或 ", inlineShortcut("quit", quitShortcutLabel), " 会二次确认；空闲时直接退出。"]
											: "仅在有会话任务正在运行时，关闭窗口会二次确认；空闲时直接退出。"
										})
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
										jsxs("div", { className: "dshDesktopBridgeDesc", children: closeChatShortcutLabel
											? ["总开关。关闭后不创建托盘图标；下方「任务显示数量」与「关闭窗口到托盘」不可用。", inlineShortcut("closeChat", closeChatShortcutLabel), " 仍会隐藏窗口（无托盘时回到程序坞/任务栏）。"]
											: "总开关。关闭后不创建托盘图标；下方「任务显示数量」与「关闭窗口到托盘」不可用。"
										})
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
										jsxs("div", { className: "dshDesktopBridgeDesc", children: quitShortcutLabel
											? ["需先开启系统托盘。开启后：点 Chat 窗口 X 会隐藏到托盘，不会退出。", inlineShortcut("quit-tray", quitShortcutLabel), " 和「退出」仍会退出。"]
											: "需先开启系统托盘。开启后：点 Chat 窗口 X 会隐藏到托盘，不会退出。「退出」仍会退出。"
										})
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
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: "DSH增强设置" }),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: "显示“复制会话ID”菜单" }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: "在会话右侧菜单中显示“复制会话ID”选项，便于调试、脚本调用和问题反馈。" })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.showCopySessionId !== false,
										checked: prefs?.showCopySessionId !== false,
										disabled: !connected || pending || !prefs,
										onChange: (event) => void invoke("setShowCopySessionId", { enabled: event.target.checked })
									})
								})
							]
						})
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: "快捷键" }),
						jsx("div", {
							className: "dshDesktopBridgeDesc",
							style: { padding: "0 0 8px" },
							children: "点击按键可录制新快捷键；清除可取消加速键（菜单仍可点）；恢复默认还原该条内置绑定。未按下新组合时点击空白处取消录制。绑定的关闭/隐藏 Chat 快捷键始终隐藏 Chat（开托盘则进托盘）；窗口 X 遵循「关闭到托盘」。"
						}),
						...shortcutRows,
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

		function sessionsFromSnapshot(listState, archivedSessionIds = []) {
			const byId = listState && listState.byId;
			if (!byId) return { sessions: [], clearErrors: [] };
			const archived = new Set(Array.isArray(archivedSessionIds) ? archivedSessionIds.map(String) : []);
			const clearErrors = [];
			const current = listState.current;
			if (current && stickySessionErrors.has(current)) {
				stickySessionErrors.delete(current);
				clearErrors.push(current);
			}
			const out = [];
			const seen = new Set();
			for (const id of Object.keys(byId)) {
				const s = byId[id];
				if (!s) continue;
				const sid = String(s.sessionId || s.id || id).trim();
				if (!sid || seen.has(sid)) continue;
				seen.add(sid);
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
					error: !running && stickySessionErrors.has(sid),
					// Chat empty-log bit. Tray drops these; displayTitle is the cwd basename.
					blank: Boolean(s.blank),
					// Workspace controller archive state is global to all workspaces.
					archived: archived.has(sid) || Boolean(s.archived) || Boolean(s.isArchived),
					// Subagent children are rendered below their parent, not as top-level rows.
					origin: typeof s.origin === "string" ? s.origin : ""
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

		const inject = ["slots", "connection", "sessions", "remote", "uiWorkspace", "workspaces"];
		const OPEN_SESSION_EVENT = "dsh-desktop-open-session";
		const OPEN_SESSION_PENDING_GLOBAL = "__DSH_DESKTOP_OPEN_SESSION_PENDING__";
		function apply(ctx) {
			installStyle();
			void ctx.connection.rpc.call(CHANNEL, "prefs", {}).then((result) => {
				if (result?.ok) publishShowCopySessionId(result.value);
			}).catch(() => {});
			const stopNavIcon = installDesktopNavIcon();
			const stopCopySessionIdMenu = installCopySessionIdMenu();
			if (typeof ctx.effect === "function") {
				ctx.effect(() => () => {
					stopNavIcon();
					stopCopySessionIdMenu();
				});
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
			const archivedSessionIds = () => {
				try {
					const workspaces = typeof ctx.get === "function" ? ctx.get("workspaces") : ctx.workspaces;
					return workspaces?.list?.getSnapshot?.()?.archivedSessionIds || [];
				} catch (_) {
					return [];
				}
			};

			// A tray click can race the asynchronous Session-list baseline. Keep the
			// id until it is listed, then use the official DSH UI navigation API.
			const OPEN_SESSION_CLAIM_POLL_INITIAL_MS = 500;
			const OPEN_SESSION_CLAIM_POLL_MAX_MS = 10000;
			const OPEN_SESSION_DEDUPE_MS = 1000;
			let pendingOpenSessionId = "";
			let lastOpenedSessionId = "";
			let lastOpenedSessionAt = 0;
			const flushPendingOpenSession = () => {
				const id = pendingOpenSessionId;
				if (!id) return;
				const snap = typeof ctx.sessions?.list?.getSnapshot === "function"
					? ctx.sessions.list.getSnapshot()
					: null;
				if (!snap?.byId || !snap.byId[id]) return;
				try {
					const uiWorkspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
					if (!uiWorkspace || typeof uiWorkspace.openSession !== "function") return;
					uiWorkspace.openSession(id);
					if (pendingOpenSessionId === id) pendingOpenSessionId = "";
					lastOpenedSessionId = id;
					lastOpenedSessionAt = Date.now();
				} catch (_) { /* list/service may still be settling; retry on next snapshot */ }
			};
			const queueOpenSession = (sessionId, fromEvent = false) => {
				const id = String(sessionId || "").trim();
				if (!id) return;
				if (fromEvent && lastOpenedSessionId === id && Date.now() - lastOpenedSessionAt < OPEN_SESSION_DEDUPE_MS) {
					let current = "";
					try {
						current = ctx.sessions?.list?.getSnapshot?.()?.current || "";
					} catch (_) { /* allow the event to retry */ }
					if (current === id) return;
				}
				pendingOpenSessionId = id;
				flushPendingOpenSession();
			};
			const consumeQueuedOpenSession = (sessionId) => {
				if (typeof window === "undefined") return;
				const id = String(sessionId || "").trim();
				if (id && window[OPEN_SESSION_PENDING_GLOBAL] === id) window[OPEN_SESSION_PENDING_GLOBAL] = "";
			};
			const drainQueuedOpenSession = () => {
				if (typeof window === "undefined") return;
				const id = String(window[OPEN_SESSION_PENDING_GLOBAL] || "").trim();
				window[OPEN_SESSION_PENDING_GLOBAL] = "";
				if (id) queueOpenSession(id);
			};
			const syncBusy = () => {
				try {
					const snap = typeof ctx.sessions?.list?.getSnapshot === "function"
						? ctx.sessions.list.getSnapshot()
						: null;
					pushBusy(anySessionRunning(snap));
					pushSessions(sessionsFromSnapshot(snap, archivedSessionIds()));
					flushPendingOpenSession();
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
			const workspaces = typeof ctx.get === "function" ? ctx.get("workspaces") : ctx.workspaces;
			if (workspaces?.list && typeof workspaces.list.subscribe === "function") {
				ctx.effect(() => workspaces.list.subscribe(syncBusy));
			}

			const handleClaimedOpenSession = (result) => {
				const id = result && result.ok && result.value ? result.value.sessionId : "";
				if (!id) return false;
				// The native click dispatches a WebView event and leaves the same id
				// claimable for missed-event recovery. If the event path already opened
				// it, consume the claim without starting a second history/layout update.
				if (lastOpenedSessionId === id && Date.now() - lastOpenedSessionAt < OPEN_SESSION_DEDUPE_MS) {
					return true;
				}
				let current = "";
				try {
					current = ctx.sessions?.list?.getSnapshot?.()?.current || "";
				} catch (_) { /* keep the claim */ }
				if (lastOpenedSessionId === id && current === id) return true;
				queueOpenSession(id);
				return true;
			};
			const claimOpenSession = () => ctx.connection.rpc.call(CHANNEL, "claimOpenSession", {})
				.then(handleClaimedOpenSession)
				.catch(() => false);
			const onOpenSession = (event) => {
				const id = event && event.detail;
				consumeQueuedOpenSession(id);
				queueOpenSession(id, true);
				void claimOpenSession();
			};
			if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
				window.addEventListener(OPEN_SESSION_EVENT, onOpenSession);
				if (typeof ctx.effect === "function") {
					ctx.effect(() => () => window.removeEventListener(OPEN_SESSION_EVENT, onOpenSession));
				}
				drainQueuedOpenSession();
			}
			if (typeof setTimeout === "function") {
				ctx.effect(() => {
					let stopped = false;
					let timer = null;
					let pollDelay = OPEN_SESSION_CLAIM_POLL_INITIAL_MS;
					const poll = () => {
						if (stopped) return;
						void claimOpenSession().then((claimed) => {
							pollDelay = claimed
								? OPEN_SESSION_CLAIM_POLL_INITIAL_MS
								: Math.min(pollDelay * 2, OPEN_SESSION_CLAIM_POLL_MAX_MS);
						}).finally(() => {
							flushPendingOpenSession();
							if (!stopped) timer = setTimeout(poll, pollDelay);
						});
					};
					poll();
					return () => {
						stopped = true;
						if (timer !== null) clearTimeout(timer);
					};
				}, "desktop-bridge: poll pending open session");
			} else {
				void claimOpenSession();
			}
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
