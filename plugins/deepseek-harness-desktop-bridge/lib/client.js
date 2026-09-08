window.__ModuleLoader__.load({
	id: "@deepseek-ai/deepseek-harness-desktop-bridge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const { jsx, jsxs } = jsxRuntime;
		const STYLE_ID = "deepseek-harness-desktop-bridge";
		const CHANNEL = "/desktop-bridge";
		const labels = Object.freeze({
			stopped: "未启动",
			starting: "启动中",
			running: "运行中",
			stopping: "停止中",
			failed: "启动失败"
		});

		function installStyle() {
			if (typeof document === "undefined" || document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
			const style = document.createElement("style");
			style.dataset.plugin = STYLE_ID;
			style.dataset.pluginCss = STYLE_ID;
			style.textContent = `
				.dshDesktopBridge { color: var(--dsw-alias-label-primary); max-width: 620px; }
				.dshDesktopBridge h3 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
				.dshDesktopBridge p { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 13px; line-height: 1.55; }
				.dshDesktopBridgeCard { margin-top: 18px; padding: 16px; background: var(--dsw-alias-bg-layer-3); border: .5px solid var(--dsw-alias-border-l4); border-radius: 14px; }
				.dshDesktopBridgeStatus { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
				.dshDesktopBridgeDot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
				.dshDesktopBridgeDot[data-state="running"] { background: #18a058; }
				.dshDesktopBridgeDot[data-state="starting"], .dshDesktopBridgeDot[data-state="stopping"] { background: #d99000; }
				.dshDesktopBridgeDot[data-state="failed"] { background: #dc4446; }
				.dshDesktopBridgeMeta { display: grid; gap: 5px; margin-top: 12px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
				.dshDesktopBridgeActions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
				.dshDesktopBridgeActions button { font: inherit; cursor: pointer; border: .5px solid var(--dsw-alias-border-l4); color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); border-radius: 8px; padding: 7px 12px; }
				.dshDesktopBridgeActions button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
				.dshDesktopBridgeActions button:disabled { cursor: default; opacity: .45; }
				.dshDesktopBridgeActions .dshDesktopBridgePrimary { color: var(--dsw-alias-bg-layer-3); background: var(--dsw-alias-label-primary); }
				.dshDesktopBridgeError { margin-top: 12px !important; color: var(--dsw-alias-label-error) !important; }
			`;
			document.head.appendChild(style);
		}

		function DesktopManagementTab({ connection }) {
			installStyle();
			const [status, setStatus] = react.useState(null);
			const [message, setMessage] = react.useState("");
			const [pending, setPending] = react.useState(false);
			const refresh = react.useCallback(async (signal) => {
				try {
					const result = await connection.rpc.call(CHANNEL, "status", {}, signal);
					if (!result.ok) throw new Error(result.error.message);
					setStatus(result.value);
					setMessage("");
				} catch (error) {
					if (error?.name === "AbortError") return;
					setMessage(error?.message || "无法读取桌面端状态");
				}
			}, [connection]);
			react.useEffect(() => {
				const controller = new AbortController();
				void refresh(controller.signal);
				const timer = setInterval(() => void refresh(controller.signal), 2500);
				return () => {
					controller.abort();
					clearInterval(timer);
				};
			}, [refresh]);
			const invoke = async (endpoint, text) => {
				setPending(true);
				setMessage("");
				try {
					const result = await connection.rpc.call(CHANNEL, endpoint, {});
					if (!result.ok) throw new Error(result.error.message);
					setMessage(text);
					await refresh();
				} catch (error) {
					setMessage(error?.message || "桌面管理操作失败");
				} finally {
					setPending(false);
				}
			};
			const state = status?.state || "stopped";
			const options = status?.options || {};
			return jsxs("div", {
				className: "dshDesktopBridge",
				children: [
					jsx("h3", { children: "桌面管理" }),
					jsx("p", { children: "这里的操作由 Deepseek Harness Desktop 执行，只管理桌面端自己启动的 DSH 进程。" }),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
							jsxs("div", { className: "dshDesktopBridgeStatus", children: [jsx("span", { className: "dshDesktopBridgeDot", "data-state": state }), jsx("span", { children: labels[state] || state })] }),
							jsxs("div", { className: "dshDesktopBridgeMeta", children: [jsx("span", { children: options.executable ? `CLI：${options.executable}` : "尚未配置 CLI" }), jsx("span", { children: options.port ? `地址：http://127.0.0.1:${options.port}/` : "地址：未就绪" })] }),
							jsxs("div", {
								className: "dshDesktopBridgeActions",
								children: [
									jsx("button", { className: "dshDesktopBridgePrimary", type: "button", disabled: pending || state === "starting" || state === "stopping", onClick: () => void invoke("restart", "已请求启动 / 重启 DSH"), children: state === "running" ? "重启 DSH" : "启动 DSH" }),
									jsx("button", { type: "button", disabled: pending || (state !== "running" && state !== "starting"), onClick: () => void invoke("stop", "已请求停止 DSH"), children: "停止 DSH" }),
									jsx("button", { type: "button", disabled: pending, onClick: () => void refresh(), children: "刷新状态" }),
									jsx("button", { type: "button", disabled: pending, onClick: () => void invoke("openManagement", "已打开桌面端配置"), children: "打开桌面配置" })
								]
							}),
							message ? jsx("p", { className: "dshDesktopBridgeError", role: "status", children: message }) : null
						]
					})
				]
			});
		}

		const inject = ["slots", "connection"];
		function apply(ctx) {
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "deepseek-harness-desktop",
				order: 5,
				label: "桌面管理"
			}, () => jsx(DesktopManagementTab, { connection: ctx.connection })));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
