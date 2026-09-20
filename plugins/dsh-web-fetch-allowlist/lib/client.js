window.__ModuleLoader__.load({
	id: "dsh-web-fetch-allowlist",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		const { IconChevronDownOutline14 } = require("@deepseek-ai/dsh-client-ui-primitives");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");

		const SETTINGS_NS = "web-fetch-allowlist";
		const LOCALE_NS = "settings.web-fetch-allowlist";
		const inject = ["slots", "locale", "settingsScope"];

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
			expand: "Show settings",
			collapse: "Hide settings",
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
			expand: "展开设置",
			collapse: "收起设置",
		};

		const card = {
			card: "YyYd_a_card",
			cardOpen: "YyYd_a_cardOpen",
			header: "YyYd_a_header",
			headText: "YyYd_a_headText",
			name: "YyYd_a_name",
			description: "YyYd_a_description",
			chevron: "YyYd_a_chevron",
			chevronOpen: "YyYd_a_chevronOpen",
			body: "YyYd_a_body",
			readOnly: "YyYd_a_readOnly",
			pending: "YyYd_a_pending",
			footer: "YyYd_a_footer",
			failed: "YyYd_a_failed",
			discard: "YyYd_a_discard",
			save: "YyYd_a_save",
		};
		const field = {
			field: "At1oFq_field",
			head: "At1oFq_head",
			label: "At1oFq_label",
			badges: "At1oFq_badges",
			badge: "At1oFq_badge",
			reset: "At1oFq_reset",
			input: "At1oFq_input",
			hint: "At1oFq_hint",
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
				this.scope.subscribe(() => this.publish());
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
					if (this.clear || text === "") await this.scope.unset("hosts");
					else await this.scope.set("hosts", text);
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
					save: () => {
						void this.save();
					},
					discard: () => this.discard(),
					hooks: { allowlistCard: this.store },
				};
			}
		}

		function AllowlistCard(props) {
			const t = props.t;
			const state = props.useAllowlistCard((snapshot) => snapshot);
			const [open, setOpen] = React.useState(false);
			const saveStarted = React.useRef(false);
			React.useEffect(() => {
				if (state.saving) {
					saveStarted.current = true;
					return;
				}
				if (!saveStarted.current) return;
				saveStarted.current = false;
				if (!state.dirty && !state.failed) setOpen(false);
			}, [state.dirty, state.failed, state.saving]);
			if (!state.available) return null;
			const title = t("title");
			const blocked = !state.dirty || state.invalid || state.saving;
			const disabled = !state.writable;
			return jsxs("li", {
				className: [card.card, open ? card.cardOpen : ""].filter(Boolean).join(" "),
				children: [
					jsxs("button", {
						type: "button",
						className: card.header,
						"aria-expanded": open,
						"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
						onClick: () => setOpen(!open),
						children: [
							jsxs("span", {
								className: card.headText,
								children: [
									jsx("span", { className: card.name, children: title }),
									jsx("span", { className: card.description, children: t("description") }),
								],
							}),
							state.dirty ? jsx("span", { className: card.pending, children: t("unsaved") }) : null,
							jsx(IconChevronDownOutline14, {
								className: [card.chevron, open ? card.chevronOpen : ""].filter(Boolean).join(" "),
							}),
						],
					}),
					open
						? jsxs("div", {
								className: card.body,
								children: [
									!state.writable
										? jsx("p", { className: card.readOnly, role: "status", children: t("readOnly") })
										: null,
									jsxs("div", {
										className: field.field,
										children: [
											jsxs("div", {
												className: field.head,
												children: [
													jsx("label", {
														className: field.label,
														htmlFor: "plugin-config-web-fetch-allowlist-0",
														children: t("hosts"),
													}),
													state.hosts.overridden
														? jsxs("span", {
																className: field.badges,
																children: [
																	jsx("span", { className: field.badge, children: t("overridden") }),
																	jsx("button", {
																		type: "button",
																		className: field.reset,
																		disabled,
																		onClick: () => props.resetField(),
																		children: t("reset"),
																	}),
																],
															})
														: null,
												],
											}),
											state.hosts.rows.map((row, index) =>
												jsx(
													"input",
													{
														id: `plugin-config-web-fetch-allowlist-${index}`,
														className: field.input,
														type: "text",
														value: row,
														placeholder: index === 0 ? "example.com" : "",
														disabled,
														style: index > 0 ? { marginTop: 6 } : undefined,
														onChange: (event) => props.editRow(index, event.target.value),
													},
													`host-${index}`,
												),
											),
											jsx("p", { className: field.hint, children: t("hostsHint") }),
										],
									}),
									jsxs("div", {
										className: card.footer,
										children: [
											state.failed
												? jsx("p", { className: card.failed, role: "status", children: t("saveFailed") })
												: null,
											jsx("button", {
												type: "button",
												className: card.discard,
												disabled: !state.dirty || state.saving,
												onClick: props.discard,
												children: t("discard"),
											}),
											jsx("button", {
												type: "button",
												className: card.save,
												disabled: blocked,
												onClick: props.save,
												children: t(state.saving ? "saving" : "save"),
											}),
										],
									}),
								],
							})
						: null,
				],
			});
		}

		function apply(ctx) {
			ctx.effect(
				() => ctx.locale.register(LOCALE_NS, { zh, en }),
				"web-fetch-allowlist: copy dictionaries",
			);
			const controller = new AllowlistCardController(ctx.settingsScope.bind({ namespace: SETTINGS_NS }));
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register(
					{
						name: "settings.plugin.item",
						key: SETTINGS_NS,
						locale: LOCALE_NS,
						inject: () => controller.inject(),
					},
					AllowlistCard,
				);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
