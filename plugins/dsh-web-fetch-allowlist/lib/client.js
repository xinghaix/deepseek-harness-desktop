window.__ModuleLoader__.load({
	id: "dsh-web-fetch-allowlist",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

		const SETTINGS_NS = "web-fetch-allowlist";
		const LOCALE_NS = "settings.web-fetch-allowlist";
		const inject = ["slots", "locale", "configForms"];

		const en = {
			title: "Web fetch allowlist",
			description: "Let native web_fetch reach allowlisted hosts through local Fake-IP / TUN DNS.",
			hosts: "Allowed hosts",
			hostsHint: "One domain or URL per line. Subdomains match. Leave a trailing blank line to add another.",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			unsaved: "Unsaved",
			saveFailed: "This deployment did not accept these values. They are kept so you can edit them.",
			readOnly: "Settings are read-only in this deployment.",
			overridden: "Overridden",
			reset: "Reset",
		};
		const zh = {
			title: "网页抓取白名单",
			description: "让原生 web_fetch 能访问白名单主机（含本机 Fake-IP / TUN 解析）。",
			hosts: "允许抓取的域名",
			hostsHint: "一行一个域名或 URL，子域自动匹配。末尾空行可继续添加。",
			save: "保存",
			saving: "保存中…",
			discard: "放弃修改",
			unsaved: "未保存",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			readOnly: "当前部署下设置只读。",
			overridden: "已覆盖",
			reset: "重置",
		};

		function storedHosts(scope) {
			const value = scope.getSnapshot().value?.hosts;
			return typeof value === "string" ? value : "";
		}

		function userHasHosts(scope) {
			const user = scope.getSnapshot().user;
			return Boolean(user && typeof user === "object" && Object.prototype.hasOwnProperty.call(user, "hosts"));
		}

		function rowsFromText(text) {
			const lines = String(text ?? "").split(/\n/u);
			if (lines.length === 0 || lines[lines.length - 1] !== "") lines.push("");
			return lines;
		}

		function textFromRows(rows) {
			const copy = [...rows];
			while (copy.length > 1 && copy[copy.length - 1] === "") copy.pop();
			return copy.join("\n");
		}

		class AllowlistCardController {
			constructor(scope) {
				this.scope = scope;
				this.staged = undefined;
				this.clear = false;
				this.saving = false;
				this.failed = false;
				this.store = createSnapshotStore(this.projection());
				this.unsubscribe = this.scope.subscribe(() => this.publish());
			}

			baseHosts() {
				const base = this.scope.getSnapshot().base;
				return typeof base?.hosts === "string" ? base.hosts : "";
			}

			projection() {
				const snap = this.scope.getSnapshot();
				const stored = storedHosts(this.scope);
				const text = this.staged !== undefined ? this.staged : stored;
				const dirty = this.clear || (this.staged !== undefined && this.staged !== stored);
				return {
					available: snap.status === "ready",
					writable: snap.writable,
					dirty,
					invalid: false,
					saving: this.saving,
					failed: this.failed,
					hosts: {
						text,
						rows: rowsFromText(text),
						overridden: this.clear ? false : this.staged !== undefined ? this.staged.trim() !== "" : userHasHosts(this.scope),
					},
				};
			}

			publish() {
				this.store.set(this.projection());
			}

			editRow(index, value) {
				const parts = String(value).split(/\r?\n/u);
				const rows = rowsFromText(this.projection().hosts.text);
				rows.splice(index, 1, ...parts);
				this.staged = textFromRows(rows);
				this.clear = false;
				this.failed = false;
				this.publish();
			}

			resetField() {
				this.staged = this.baseHosts();
				this.clear = true;
				this.failed = false;
				this.publish();
			}

			discard() {
				this.staged = undefined;
				this.clear = false;
				this.failed = false;
				this.publish();
			}

			async save() {
				if (this.saving) return;
				const snap = this.projection();
				if (!snap.dirty || !snap.writable) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				try {
					const text = (this.staged ?? "").trim();
					const clearing = this.clear || text === "";
					// configForms.set/unset resolve to false after a refused write + recovery.
					const ok = clearing ? await this.scope.unset("hosts") : await this.scope.set("hosts", text);
					if (!ok) {
						this.failed = true;
						return;
					}
					// Belt-and-suspenders: confirm the mirrored user layer matches.
					const accepted = this.scope.getSnapshot();
					if (accepted.status !== "ready" || (clearing
						? userHasHosts(this.scope)
						: !userHasHosts(this.scope) || accepted.user.hosts !== text)) {
						this.failed = true;
						return;
					}
					this.staged = undefined;
					this.clear = false;
				} catch {
					this.failed = true;
				} finally {
					this.saving = false;
					this.publish();
				}
			}

			inject() {
				return {
					editRow: (index, value) => this.editRow(index, value),
					resetField: () => this.resetField(),
					save: () => this.save(),
					discard: () => this.discard(),
					hooks: { allowlistCard: this.store },
				};
			}
		}

		// The plugin manager owns the title and description, not a settings accordion.
		function AllowlistConfig(props) {
			if (props.view === "summary") return props.t("description");
			return jsx(AllowlistForm, props);
		}

		function AllowlistForm(props) {
			const t = props.t;
			const state = props.useAllowlistCard((snapshot) => snapshot);
			React.useEffect(() => () => props.discard(), [props.discard]);
			if (!state.available) return jsx("p", { role: "status", children: t("readOnly") });
			const disabled = !state.writable || state.saving;
			const buttonStyle = { font: "inherit", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", color: "inherit" };
			return jsxs("section", {
				"aria-label": t("title"),
				style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 760, color: "var(--dsw-alias-label-primary)" },
				children: [
					!state.writable ? jsx("p", { role: "status", children: t("readOnly") }) : null,
					jsxs("div", {
						style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 },
						children: [
							jsx("label", { htmlFor: "plugin-config-web-fetch-allowlist-0", children: t("hosts") }),
							state.hosts.overridden ? jsx("span", { children: t("overridden") }) : null,
							state.hosts.overridden ? jsx("button", { type: "button", style: buttonStyle, disabled, onClick: props.resetField, children: t("reset") }) : null,
							state.dirty ? jsx("span", { role: "status", children: t("unsaved") }) : null,
						],
					}),
					state.hosts.rows.map((row, index) => jsx("input", {
						id: `plugin-config-web-fetch-allowlist-${index}`,
						type: "text",
						"aria-label": `${t("hosts")} ${index + 1}`,
						"aria-describedby": "plugin-config-web-fetch-allowlist-hint",
						value: row,
						placeholder: index === 0 ? "example.com" : "",
						disabled,
						style: { boxSizing: "border-box", width: "100%", padding: "8px 10px", font: "inherit", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", color: "inherit" },
						onChange: (event) => props.editRow(index, event.target.value),
					}, `host-${index}`)),
					jsx("p", { id: "plugin-config-web-fetch-allowlist-hint", style: { margin: 0, color: "var(--dsw-alias-label-tertiary)" }, children: t("hostsHint") }),
					state.failed ? jsx("p", { role: "alert", children: t("saveFailed") }) : null,
					jsxs("div", {
						style: { display: "flex", justifyContent: "flex-end", gap: 8 },
						children: [
							jsx("button", { type: "button", style: buttonStyle, disabled: !state.dirty || state.saving, onClick: props.discard, children: t("discard") }),
							jsx("button", { type: "button", style: buttonStyle, disabled: disabled || !state.dirty || state.invalid, onClick: props.save, children: t(state.saving ? "saving" : "save") }),
						],
					}),
				],
			});
		}

		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(LOCALE_NS, { zh, en }),
				"web-fetch-allowlist: copy dictionaries",
			);
			const controller = new AllowlistCardController(ctx.configForms.get(SETTINGS_NS));
			ctx.effect(() => () => controller.unsubscribe(), "web-fetch-allowlist: settings subscription");
			const face = controller.inject();
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register(
				{
					name: "plugins.bundle.config",
					key: "dsh-web-fetch-allowlist",
					locale: LOCALE_NS,
					inject: () => face,
				},
				AllowlistConfig,
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
