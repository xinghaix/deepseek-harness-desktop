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
		const CAPABILITIES_SCHEMA = "deepseek-harness-desktop/capabilities";
		const CAPABILITIES_PROTOCOL = "1";
		const BRIDGE_PROTOCOL = "1";
		const WEBVIEW_BOOT_PROTOCOL = "1";
		const HTTP_TRANSPORT = "loopback-http";
		const TRANSPORT_STATE_GLOBAL = "__DSH_DESKTOP_TRANSPORT__";
		const handshakeByConnection = new WeakMap();

		function publishTransportState(state) {
			if (typeof window === "undefined") return;
			window[TRANSPORT_STATE_GLOBAL] = Object.freeze({
				mode: state?.mode || "http-fallback",
				compatible: state?.compatible === true,
				capabilities: state?.capabilities
			});
		}

		function callDesktopRPCRaw(connection, endpoint, payload, signal) {
			try {
				return Promise.resolve(connection.rpc.call(CHANNEL, endpoint, payload || {}, signal));
			} catch (error) {
				return Promise.reject(error);
			}
		}

		function desktopHandshake(connection) {
			const request = {
				schema: CAPABILITIES_SCHEMA,
				protocol: CAPABILITIES_PROTOCOL,
				bridgeProtocol: BRIDGE_PROTOCOL,
				webviewBootProtocol: WEBVIEW_BOOT_PROTOCOL,
				transport: { selected: HTTP_TRANSPORT, candidates: [HTTP_TRANSPORT] },
				features: ["authenticated-bridge", "capability-handshake", "loopback-http", "webview-boot"]
			};
			// Capabilities is a probe, not a source of credentials. A missing or old
			// route must degrade to the existing HTTP bridge rather than block Chat.
			return callDesktopRPCRaw(connection, "capabilities", {}, undefined)
				.catch(() => undefined)
				.then(() => callDesktopRPCRaw(connection, "handshake", request, undefined))
				.then((result) => {
					const value = result?.ok ? (result.value || {}) : {};
					const selected = value?.transport?.selected;
					const state = {
						mode: selected === HTTP_TRANSPORT ? HTTP_TRANSPORT : "http-fallback",
						compatible: result?.ok === true && value?.compatible !== false,
						capabilities: value?.capabilities || value
					};
					publishTransportState(state);
					return state;
				})
				.catch(() => {
					const state = { mode: "http-fallback", compatible: false, capabilities: undefined };
					publishTransportState(state);
					return state;
				});
		}

		function ensureDesktopHandshake(connection) {
			if (!connection || (typeof connection !== "object" && typeof connection !== "function")) {
				const state = { mode: "http-fallback", compatible: false };
				publishTransportState(state);
				return Promise.resolve(state);
			}
			let pending = handshakeByConnection.get(connection);
			if (!pending) {
				pending = desktopHandshake(connection);
				handshakeByConnection.set(connection, pending);
			}
			return pending;
		}

		function callDesktopRPC(connection, endpoint, payload, signal) {
			// Negotiation is advisory and must never delay or block the existing
			// authenticated HTTP bridge. Unknown/old peers therefore keep working.
			void ensureDesktopHandshake(connection);
			return callDesktopRPCRaw(connection, endpoint, payload, signal);
		}

		// Process/link state text resolves through the shared catalog; an unknown value
		// renders itself so a newer desktop state can never show an empty chip.
		const STATE_LABEL_KEYS = Object.freeze({
			stopped: "state.stopped",
			starting: "state.starting",
			running: "state.running",
			stopping: "state.stopping",
			failed: "state.failed"
		});
		const LINK_LABEL_KEYS = Object.freeze({
			connected: "bridge.status_connected",
			reconnecting: "bridge.status_reconnecting",
			"desktop-not-running": "bridge.status_desktop_down"
		});
		function stateLabel(state) {
			return STATE_LABEL_KEYS[state] ? t(STATE_LABEL_KEYS[state]) : state;
		}
		function linkLabel(link) {
			return LINK_LABEL_KEYS[link] ? t(LINK_LABEL_KEYS[link]) : link;
		}
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
		const DELETE_SESSION_ACTIONS_GLOBAL = "__DSH_DESKTOP_DELETE_SESSION_ACTIONS__";
		const DELETE_SESSION_ACTIONS_EVENT = "dsh-desktop-delete-session-actions";
		if (typeof window !== "undefined" && typeof window[DELETE_SESSION_ACTIONS_GLOBAL] !== "boolean") {
			window[DELETE_SESSION_ACTIONS_GLOBAL] = true;
		}
		function publishDeleteSessionActions(value) {
			if (typeof value?.deleteSessionActions !== "boolean" || typeof window === "undefined") return;
			const enabled = value.deleteSessionActions;
			window[DELETE_SESSION_ACTIONS_GLOBAL] = enabled;
			if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
			window.dispatchEvent(new CustomEvent(DELETE_SESSION_ACTIONS_EVENT, { detail: enabled }));
		}
		const HOVER_MESSAGE_ACTIONS_GLOBAL = "__DSH_DESKTOP_HOVER_MESSAGE_ACTIONS__";
		const HOVER_MESSAGE_ACTIONS_EVENT = "dsh-desktop-hover-message-actions";
		const HOVER_MESSAGE_ACTIONS_ATTR = "data-dsh-desktop-hover-message-actions";
		const HOVER_MESSAGE_ACTIONS_STYLE_ID = "deepseek-harness-desktop-hover-message-actions";
		if (typeof window !== "undefined" && typeof window[HOVER_MESSAGE_ACTIONS_GLOBAL] !== "boolean") {
			window[HOVER_MESSAGE_ACTIONS_GLOBAL] = true;
		}
		function publishHoverMessageActions(value) {
			if (typeof value?.hoverMessageActions !== "boolean" || typeof window === "undefined") return;
			const enabled = value.hoverMessageActions;
			window[HOVER_MESSAGE_ACTIONS_GLOBAL] = enabled;
			if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
			window.dispatchEvent(new CustomEvent(HOVER_MESSAGE_ACTIONS_EVENT, { detail: enabled }));
		}
		// Session selection can change before Chat has hydrated the new history. The overlay
		// listens to this signal so it can clear the old mirror without coupling to DSH internals.
		const ACTIVE_SESSION_GLOBAL = "__DSH_DESKTOP_ACTIVE_SESSION_ID__";
		const ACTIVE_SESSION_EVENT = "dsh-desktop-active-session-changed";
		function normalizeActiveSessionId(value) {
			if (value && typeof value === "object") value = value.sessionId || value.id;
			return String(value || "").trim();
		}
		function publishActiveSessionId(value) {
			if (typeof window === "undefined") return;
			const next = normalizeActiveSessionId(value);
			const previous = normalizeActiveSessionId(window[ACTIVE_SESSION_GLOBAL]);
			if (previous === next) return;
			window[ACTIVE_SESSION_GLOBAL] = next;
			if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
			window.dispatchEvent(new CustomEvent(ACTIVE_SESSION_EVENT, { detail: next }));
		}
		const PROMPT_OVERLAY_ATTR = "data-dsh-desktop-prompt-overlay";
		const PROMPT_OVERLAY_CONTENT_ATTR = "data-dsh-desktop-prompt-overlay-content";
		const PROMPT_OVERLAY_MEDIA_ATTR = "data-dsh-desktop-prompt-overlay-media";
		const PROMPT_OVERLAY_FILES_ATTR = "data-dsh-desktop-prompt-overlay-files";
		const PROMPT_OVERLAY_ATTACHMENTS_ATTR = "data-dsh-desktop-prompt-overlay-attachments";
		const PROMPT_OVERLAY_TEXT_ATTR = "data-dsh-desktop-prompt-overlay-text";
		// The scrolling box, INSIDE the card. Kept separate from the card so the card's padding
		// stays on screen while the text scrolls (see the CSS comment below).
		const PROMPT_OVERLAY_BODY_ATTR = "data-dsh-desktop-prompt-overlay-body";
		// Set while the body can still scroll down, which fades the body's last visible line so a
		// clipped line reads as "more below" rather than as a hard cut.
		const PROMPT_OVERLAY_MORE_BELOW_ATTR = "data-dsh-desktop-prompt-overlay-more-below";
		const PROMPT_OVERLAY_VARIANT_ATTR = "data-dsh-desktop-prompt-overlay-variant";
		const PROMPT_OVERLAY_LOAD_OLDER_ATTR = "data-dsh-desktop-prompt-overlay-load-older";
		const PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR = "data-dsh-desktop-prompt-overlay-encounter-older";
		const PROMPT_OVERLAY_DIVIDER_ATTR = "data-dsh-desktop-prompt-overlay-divider";
		// Height of the fading band at the bottom of the body, about one prompt line (.86rem at
		// 1.45 line-height is ~20px). It is EXTRA space reserved on top of the configured line
		// budget — see PROMPT_OVERLAY_CHROME_PX — so the fade is always a peek at the line below
		// and never eats into the lines the user asked to read.
		const PROMPT_OVERLAY_FADE_PX = 20;
		// Prefixed so it cannot collide with a keyframes name owned by the Chat app or a plugin.
		const PROMPT_OVERLAY_STRIP_IN = "dsh-desktop-prompt-overlay-strip-in";
		const PROMPT_OVERLAY_ITEM_ATTR = "data-dsh-desktop-prompt-overlay-item";
		const PROMPT_OVERLAY_MORE_ATTR = "data-dsh-desktop-prompt-overlay-more";
		const PROMPT_OVERLAY_TOOLBAR_ATTR = "data-dsh-desktop-prompt-overlay-toolbar";
		const PROMPT_OVERLAY_TIME_ATTR = "data-dsh-desktop-prompt-overlay-time";
		const PROMPT_OVERLAY_ACTION_ATTR = "data-dsh-desktop-prompt-overlay-action";
		const PROMPT_OVERLAY_ACTION_DONE_ATTR = "data-dsh-desktop-prompt-overlay-action-done";
		// Marks the inline SVG inside an action button, so the stylesheet can size it and a test
		// can read which official glyph is on screen.
		const PROMPT_OVERLAY_GLYPH_ATTR = "data-dsh-desktop-prompt-overlay-glyph";
		// Carries the hovered action's label for the strip-level tooltip, which renders in the
		// empty lane beside the strip (outside the card) instead of over its text.
		const PROMPT_OVERLAY_HINT_ATTR = "data-dsh-desktop-prompt-overlay-hint";
		// The bridge settings panel and the floating prompt both render inside the Chat
		// webview, which cannot reach Wails bindings. The desktop control plane serves the
		// same embedded catalog the config window uses (GET /v1/locale-bundle), so every
		// surface shares one translation set (see AGENTS.md § 国际化).
		const LOCALE_BUNDLE_GLOBAL = "__DSH_DESKTOP_LOCALE_BUNDLE__";
		// English fallback for the few strings that can render before the bundle arrives:
		// the floating prompt overlay mounts on scroll, ahead of any async fetch.
		const EARLY_FALLBACK_EN = Object.freeze({
			"bridge.overlay_label": "Floating prompt",
			"bridge.overlay_toolbar": "Prompt actions",
			"bridge.overlay_hidden": "(prompt content unavailable)",
			"bridge.overlay_action": "Action",
			"bridge.overlay_attachment": "Attachment",
			"bridge.overlay_copied": "Copied",
			"bridge.overlay_more": "{0} more",
			"bridge.overlay_load_older": "Load older",
			"bridge.overlay_loading": "Loading…",
			"bridge.overlay_max_lines": "Max prompt lines",
			// The settings nav resolves its label once, possibly before the catalog arrives.
			"tray.open_settings": "Desktop settings",
			"bridge.cli_version": "CLI Version: {0}",
			"bridge.restart_open_chat": "Reopen",
			"bridge.status_connected": "Connected to desktop",
			"bridge.session_delete_menu": "Delete session",
			"bridge.session_delete_confirm": "Delete this session permanently from disk? This action cannot be undone.",
			"bridge.session_delete_failed": "The session could not be deleted: {0}",
			"field.delete_session_actions": "Show the “Delete session” menu",
			"field.delete_session_actions_hint": "Show “Delete session” in the session actions menu for active and archived sessions. Deleting permanently removes the local session record from disk.",
			"bridge.session_delete_title": "Delete session?",
			"bridge.session_delete_cancel": "Cancel",
			"bridge.session_delete_action": "Delete",
			"bridge.archived_batch_select_all": "Select all",
			"bridge.archived_batch_selected": "Selected {0}",
			"bridge.archived_batch_unarchive": "Unarchive selected",
			"bridge.archived_batch_delete": "Delete selected",
			"bridge.archived_batch_unarchive_title": "Unarchive selected sessions?",
			"bridge.archived_batch_unarchive_confirm": "Unarchive {0} selected sessions?",
			"bridge.archived_batch_delete_title": "Delete selected sessions?",
			"bridge.archived_batch_delete_confirm": "Permanently delete {0} selected sessions from disk? This action cannot be undone.",
			"bridge.archived_batch_progress_title": "Processing sessions",
			"bridge.archived_batch_progress": "Processing {0} of {1}: {2}",
			"bridge.archived_batch_done": "Completed {0} of {1}",
			"bridge.archived_batch_partial": "Completed {0} of {1}; {2} failed.",
			"bridge.archived_batch_close": "Close",
		});
		let localeCatalog = Object.create(null);
		let localeCode = "";
		let localeConnection = null;
		function t(key, ...vars) {
			let text = localeCatalog[key];
			if (text == null || text === "") text = EARLY_FALLBACK_EN[key];
			// Never render a raw key: falling back to the key would look broken in the UI.
			if (text == null || text === "") return key;
			text = String(text);
			for (let index = 0; index < vars.length; index += 1) {
				text = text.split("{" + index + "}").join(vars[index] == null ? "" : String(vars[index]));
			}
			return text;
		}
		// The host reports stable, language-neutral error codes. Map them to catalog keys so
		// a bridge error follows the UI language instead of the host's English fallback text.
		// Unknown codes keep the host message (a newer host may know more than this client).
		const DESKTOP_ERROR_KEYS = Object.freeze({
			"desktop-bridge/not-allowed": "bridge.err_not_allowed",
			"desktop-bridge/desktop-not-running": "bridge.err_desktop_not_running",
			"desktop-bridge/unavailable": "bridge.err_unreachable",
			"desktop-bridge/aborted": "bridge.err_cancelled",
			"desktop-bridge/delete-invalid-id": "bridge.session_delete_failed",
			"desktop-bridge/delete-busy": "bridge.session_delete_failed",
			"desktop-bridge/delete-unsupported": "bridge.session_delete_failed",
			"desktop-bridge/delete-subagent": "bridge.session_delete_failed",
			"desktop-bridge/delete-has-children": "bridge.session_delete_failed",
			"desktop-bridge/delete-unsafe-path": "bridge.session_delete_failed",
			"desktop-bridge/delete-not-found": "bridge.session_delete_failed",
			"desktop-bridge/delete-failed": "bridge.session_delete_failed"
		});
		function desktopErrorMessage(error) {
			const key = error && typeof error.code === "string" ? DESKTOP_ERROR_KEYS[error.code] : "";
			if (key) return key === "bridge.session_delete_failed" ? t(key, error?.message || "") : t(key);
			return (error && typeof error.message === "string" && error.message.trim()) || t("bridge.err_call");
		}
		function currentLocale() {
			return localeCode;
		}
		// Some labels resolve once and are then cached by their owner (the settings nav is the
		// important one), so a catalog arriving later would leave them stale. Those owners
		// subscribe here and re-register when the language really changes.
		const localeChangeHandlers = new Set();
		function onLocaleChange(handler) {
			localeChangeHandlers.add(handler);
		}
		function setLocaleBundle(bundle) {
			if (!bundle || typeof bundle !== "object") return false;
			const catalog = bundle.catalog;
			if (!catalog || typeof catalog !== "object") return false;
			const next = typeof bundle.locale === "string" ? bundle.locale : "";
			const changed = next !== localeCode;
			localeCatalog = catalog;
			localeCode = next;
			if (typeof window !== "undefined") window[LOCALE_BUNDLE_GLOBAL] = { locale: localeCode, catalog };
			if (!changed) return true;
			for (const handler of [...localeChangeHandlers]) {
				try { handler(localeCode); } catch (_) { /* one bad listener must not break i18n */ }
			}
			return true;
		}
		function loadLocaleBundle() {
			if (!localeConnection) return Promise.resolve(false);
			// Non-fatal: a failed fetch keeps the English fallback for the handful of
			// strings that can render before the next successful load.
			return callDesktopRPC(localeConnection, "localeBundle", {}, undefined)
				.then((result) => (result?.ok ? setLocaleBundle(result.value) : false))
				.catch(() => false);
		}
		function publishPromptOverlayLanguage(value) {
			const next = typeof value?.resolvedLocale === "string" ? value.resolvedLocale : "";
			if (!next || next === localeCode) return;
			void loadLocaleBundle();
		}
		// Line budget for the floating card, published from desktop prefs. Read through a
		// function (never captured in a constant) so a settings change re-resolves on repaint.
		const PROMPT_OVERLAY_MAX_LINES_GLOBAL = "__DSH_DESKTOP_PROMPT_OVERLAY_MAX_LINES__";
		function promptOverlayMaxLines() {
			const raw = typeof window !== "undefined" ? Number(window[PROMPT_OVERLAY_MAX_LINES_GLOBAL]) : NaN;
			if (!Number.isFinite(raw)) return PROMPT_OVERLAY_DEFAULT_LINES;
			return Math.max(PROMPT_OVERLAY_MIN_LINES, Math.min(PROMPT_OVERLAY_MAX_LINES, Math.round(raw)));
		}
		// Same clamp as the card, used by the settings control so the shown value always
		// matches what the card will actually do.
		function promptOverlayMaxLinesFromPrefs(prefs) {
			const raw = Number(prefs?.promptOverlayMaxLines);
			if (!Number.isFinite(raw)) return PROMPT_OVERLAY_DEFAULT_LINES;
			return Math.max(PROMPT_OVERLAY_MIN_LINES, Math.min(PROMPT_OVERLAY_MAX_LINES, Math.round(raw)));
		}
		function publishPromptOverlayMaxLines(value) {
			const raw = Number(value?.promptOverlayMaxLines);
			if (!Number.isFinite(raw) || typeof window === "undefined") return;
			const next = Math.max(PROMPT_OVERLAY_MIN_LINES, Math.min(PROMPT_OVERLAY_MAX_LINES, Math.round(raw)));
			if (window[PROMPT_OVERLAY_MAX_LINES_GLOBAL] === next) return;
			window[PROMPT_OVERLAY_MAX_LINES_GLOBAL] = next;
			// Nothing else repaints on a settings change, so the card would keep the old height
			// until the next scroll. Ask for a rebuild now.
			if (typeof promptOverlayRefresh === "function") promptOverlayRefresh();
		}
		const PROMPT_OVERLAY_TOP_PROTECTION_PX = 56;
		// Only a fallback: when nothing is measurable the card still needs a sane width. The
		// live width follows the message column so it keeps matching the bubble when the DSH
		// web pane is expanded.
		const PROMPT_OVERLAY_MAX_WIDTH_PX = 760;
		// The card matches the official Chat composer's horizontal extent, so it lines up with the
		// input box the user reads it beside. The message column is only a fallback for the rare
		// case where no composer is mounted. An earlier "mirror the column plus a symmetric
		// slack" rule was wrong: DSH's column is not centred in its pane, so the extra width had
		// to come out of the left gutter and spilled past the column's left edge.
		const PROMPT_OVERLAY_EPSILON = 1;
		// Prompt-line budget for the card. Mirrors the desktop pref bounds; clamped here too so
		// a stale value can never produce an unusable card.
		const PROMPT_OVERLAY_MIN_LINES = 2;
		const PROMPT_OVERLAY_MAX_LINES = 21;
		const PROMPT_OVERLAY_DEFAULT_LINES = 5;
		// .86rem font at 1.45 line-height expressed in rem, so CSS does the font math itself.
		const PROMPT_OVERLAY_LINE_HEIGHT_REM = 1.247;
		const PROMPT_OVERLAY_ACTION_DONE_MS = 1400;
		// Symmetric body padding, so a text-only card and an attachments+text card share the
		// same top and bottom inset instead of the old 10px/14px asymmetry.
		const PROMPT_OVERLAY_CONTENT_PAD = 12;
		// Right padding is kept at 0 so the vertical scrollbar sits flush against the right border,
		// maximizing horizontal space for reading prompts.
		const PROMPT_OVERLAY_CONTENT_PAD_RIGHT = 0;
		// The action strip is placed ON the last line of the card instead of owning a row below
		// it. A row below the text was what made a single-line prompt look "offset down", and for
		// an attachment-only card it drifted a whole row lower still. Its own box is the control
		// plus the strip's vertical padding — the number the centring math positions against.
		const PROMPT_OVERLAY_ACTION_SIZE = 22;
		// Vertical breathing room inside the pill. The strip is a compact overlay control, not a
		// second toolbar: at 26px tall with 16px glyphs it crowded the line it hangs on.
		const PROMPT_OVERLAY_STRIP_PAD = 1;
		const PROMPT_OVERLAY_STRIP_PAD_RIGHT = 3;
		const PROMPT_OVERLAY_STRIP_PAD_LEFT = 7;
		const PROMPT_OVERLAY_STRIP_GAP = 2;
		const PROMPT_OVERLAY_STRIP_H = PROMPT_OVERLAY_ACTION_SIZE + PROMPT_OVERLAY_STRIP_PAD * 2;
		// Everything the card spends on chrome rather than content: body padding and the fading
		// peek band. The strip is NOT chrome any more — it floats over the last line, so reserving
		// its row only pushed the text up and left a blank band under it. Reserving the band here
		// is still the point: it must be ADDITIONAL to the configured line budget, otherwise the
		// fade silently shortens it and a "2 lines" card shows fewer than two readable lines.
		const PROMPT_OVERLAY_CHROME_PX = PROMPT_OVERLAY_CONTENT_PAD * 2 + PROMPT_OVERLAY_FADE_PX;
		// Official Chat glyphs, copied verbatim from the installed DSH bundle
		// (IconCopyOutline16 / IconCheckOutline16) so the overlay's controls are the same drawing
		// as Chat's own rather than a lookalike. One filled path each — not the two hand-drawn
		// strokes used before, which were also MIRRORED (front sheet bottom-right, official
		// bottom-left), which is why they read as "ugly" next to the real thing.
		const PROMPT_OVERLAY_ICON_COPY = "M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z";
		const PROMPT_OVERLAY_ICON_CHECK = "M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z";
		const PROMPT_OVERLAY_ICON_LOAD_OLDER = "M8 3.5L12.5 8H9.5V13.5H6.5V8H3.5L8 3.5Z";
		// Scaled with the 22px control: a 16px glyph inside it looked pinned edge to edge.
		const PROMPT_OVERLAY_ICON_PX = 13;
		// The timestamp is metadata beside a 22px control; at .72rem it stretched the pill wider
		// than the glyph sharing its row.
		const PROMPT_OVERLAY_TIME_REM = ".68rem";
		// Last-resort line height (px) when the browser reports no usable value: .86rem at 1.45.
		const PROMPT_OVERLAY_LINE_FALLBACK = PROMPT_OVERLAY_LINE_HEIGHT_REM * 16;
		// Thumbnail grid metrics; the overflow chip occupies exactly one cell so a 2-row cap
		// stays exact.
		const PROMPT_OVERLAY_THUMB_W = 64;
		const PROMPT_OVERLAY_THUMB_H = 48;
		const PROMPT_OVERLAY_THUMB_GAP = 6;
		const PROMPT_OVERLAY_MEDIA_ROWS = 2;
		// Target grid-track width for file chips; CSS uses exactly the computed column count.
		const PROMPT_OVERLAY_CHIP_AVG_W = 120;
		const PROMPT_OVERLAY_CHIP_ROW_H = 30;
		// Vertical padding the body adds around the attachment block.
		const PROMPT_OVERLAY_BLOCK_PAD = 2;
		function hoverMessageActionsCSS() {
			const root = "html[" + HOVER_MESSAGE_ACTIONS_ATTR + "]";
			const overlayPath = "[" + PROMPT_OVERLAY_ATTR + "]";
			const contentPath = overlayPath + " [" + PROMPT_OVERLAY_CONTENT_ATTR + "]";
			const mediaPath = contentPath + " [" + PROMPT_OVERLAY_MEDIA_ATTR + "]";
			const morePath = contentPath + " [" + PROMPT_OVERLAY_MORE_ATTR + "]";
			const filesPath = contentPath + " [" + PROMPT_OVERLAY_FILES_ATTR + "]";
			const bodyPath = contentPath + " [" + PROMPT_OVERLAY_BODY_ATTR + "]";
			const textPath = contentPath + " [" + PROMPT_OVERLAY_TEXT_ATTR + "]";
			// The toolbar is a child of the overlay, NOT of the scrolling body, so it anchors
			// against the card and never scrolls away with the text.
			const toolbarPath = overlayPath + " [" + PROMPT_OVERLAY_TOOLBAR_ATTR + "]";
			const timePath = toolbarPath + " [" + PROMPT_OVERLAY_TIME_ATTR + "]";
			const actionPath = toolbarPath + " [" + PROMPT_OVERLAY_ACTION_ATTR + "]";
			const loadOlderPath = toolbarPath + " [" + PROMPT_OVERLAY_LOAD_OLDER_ATTR + "]";
			const dividerPath = toolbarPath + " [" + PROMPT_OVERLAY_DIVIDER_ATTR + "]";
			const overlay = root + " " + overlayPath;
			const content = root + " " + contentPath;
			const body = root + " " + bodyPath;
			const media = root + " " + mediaPath;
			const attachments = content + " [" + PROMPT_OVERLAY_ATTACHMENTS_ATTR + "]";
			const more = root + " " + morePath;
			const files = root + " " + filesPath;
			const text = root + " " + textPath;
			const toolbar = root + " " + toolbarPath;
			const time = root + " " + timePath;
			const action = root + " " + actionPath;
			const loadOlder = root + " " + loadOlderPath;
			const divider = root + " " + dividerPath;
			// Descendant paths re-anchored on the overlay element, for `:hover`-prefixed selectors.
			const toolbarSuffix = " [" + PROMPT_OVERLAY_TOOLBAR_ATTR + "]";
			const bodySuffix = " [" + PROMPT_OVERLAY_BODY_ATTR + "]";
			// The bottom fade ramp: opaque until the band starts, then linear to fully transparent at
			// the very bottom edge. Ending it AT the edge (not above it) is what keeps the band a
			// fading peek instead of a strip of invisible content followed by dead space.
			const fadeMask = "linear-gradient(to bottom, #000 calc(100% - " + PROMPT_OVERLAY_FADE_PX + "px), transparent)";
			return [
								overlay + " { position: fixed !important; z-index: var(--dsw-z-index-popover, 30) !important; box-sizing: border-box !important; display: flex !important; flex-direction: column !important; pointer-events: auto !important; opacity: 1 !important; outline: none !important; max-height: min(var(--dsh-desktop-prompt-overlay-avail, 100vh), calc(var(--dsh-desktop-prompt-overlay-lines, " + PROMPT_OVERLAY_DEFAULT_LINES + ") * " + PROMPT_OVERLAY_LINE_HEIGHT_REM + "rem + var(--dsh-desktop-prompt-overlay-extra, 0px) + " + PROMPT_OVERLAY_CHROME_PX + "px)) !important; }",
				content + " { content-visibility: visible !important; display: flex !important; flex-direction: column !important; font-size: .86rem !important; gap: 8px !important; position: relative !important; box-sizing: border-box !important; width: 100% !important; max-width: 100% !important; max-height: min(var(--dsh-desktop-prompt-overlay-avail, 100vh), calc(var(--dsh-desktop-prompt-overlay-lines, " + PROMPT_OVERLAY_DEFAULT_LINES + ") * " + PROMPT_OVERLAY_LINE_HEIGHT_REM + "rem + var(--dsh-desktop-prompt-overlay-extra, 0px) + " + PROMPT_OVERLAY_FADE_PX + "px)) !important; flex: 1 1 auto !important; min-height: 0 !important; margin: 0 !important; overflow: hidden !important; pointer-events: auto !important; padding: " + PROMPT_OVERLAY_CONTENT_PAD + "px " + PROMPT_OVERLAY_CONTENT_PAD_RIGHT + "px " + PROMPT_OVERLAY_CONTENT_PAD + "px " + PROMPT_OVERLAY_CONTENT_PAD + "px !important; border: .5px solid color-mix(in srgb, var(--dsw-alias-border-l2, rgba(127,127,127,.22)) 80%, transparent) !important; border-top: 0 !important; border-radius: 0 0 16px 16px !important; background: color-mix(in srgb, var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-canvas, Canvas)) 90%, transparent) !important; -webkit-backdrop-filter: blur(16px) saturate(1.12) !important; backdrop-filter: blur(16px) saturate(1.12) !important; box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.26), 0 3px 12px -7px rgba(0, 0, 0, 0.12) !important; }",
				// The card itself must NOT scroll. Scrolling is delegated to this inner body, which the
				// card's padding insets on every side. A scroll container's own padding-bottom scrolls
				// out of view, so a card that scrolled itself clipped its last line flush against the
				// bottom border while keeping its top padding — the asymmetric look this fixes.
				body + " { display: flex !important; flex-direction: column !important; gap: 8px !important; flex: 1 1 auto !important; min-height: 0 !important; overflow-x: hidden !important; overflow-y: auto !important; overscroll-behavior: contain !important; scrollbar-width: thin !important; scrollbar-color: color-mix(in srgb, var(--dsw-alias-text-tertiary, #8a8a8a) 15%, transparent) transparent !important; transition: scrollbar-color .15s ease !important; padding-right: 6px !important; }",
				overlay + ":hover" + bodySuffix + ", " + overlay + ":focus-within" + bodySuffix + " { scrollbar-color: color-mix(in srgb, var(--dsw-alias-text-tertiary, #8a8a8a) 32%, transparent) transparent !important; }",
				// Text fades out at the very bottom so the next line looks like it continues below. A mask
				// on the scroller is used instead of a painted gradient: the text fades to transparent
				// and the card's own (translucent, blurred) surface shows through, so there is no need
				// to colour-match the card background. The ramp finishes above the bottom edge, so the
				// clipped line is gone rather than half-visible.
				body + "[" + PROMPT_OVERLAY_MORE_BELOW_ATTR + "] { -webkit-mask-image: " + fadeMask + " !important; mask-image: " + fadeMask + " !important; }",
				body + "::-webkit-scrollbar { width: 5px !important; height: 5px !important; }",
				body + "::-webkit-scrollbar-track { background: transparent !important; margin: 4px 0 8px 0 !important; }",
				// Unfocused / default state: lower contrast (subtle 15% opacity), so it doesn't distract when reading.
				body + "::-webkit-scrollbar-thumb { border: none !important; border-radius: 999px !important; background: color-mix(in srgb, var(--dsw-alias-text-tertiary, #8a8a8a) 15%, transparent) !important; background-clip: padding-box !important; transition: background .15s ease !important; }",
				// Restores current contrast (30%) when card is hovered or focused, and 48% when directly hovered on thumb.
				overlay + ":hover" + bodySuffix + "::-webkit-scrollbar-thumb, " + overlay + ":focus-within" + bodySuffix + "::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--dsw-alias-text-tertiary, #8a8a8a) 30%, transparent) !important; background-clip: padding-box !important; }",
				body + "::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--dsw-alias-text-tertiary, #8a8a8a) 48%, transparent) !important; background-clip: padding-box !important; }",
				// Keep the body inset exactly symmetric: whatever block comes first or last must not
				// add its own margin on top of the padding, or a text-only card and an
				// attachments+text card would not line up.
				body + " > :first-child { margin-top: 0 !important; }",
				body + " > :last-child { margin-bottom: 0 !important; }",
				// The action strip hangs on the LAST LINE of the card (JS centres it there) and only
				// appears on hover/focus, on an opaque pill so it never fights the text behind it.
				// It is absolutely positioned: as a flow row BELOW the text it read as offset down
				// for a single-line prompt, and for an attachment-only card it drifted a whole row
				// lower still, because a "last line" of pure attachments is a tall row, not a line.
				toolbar + " { position: absolute !important; z-index: 3 !important; right: " + PROMPT_OVERLAY_CONTENT_PAD + "px !important; box-sizing: content-box !important; max-width: calc(100% - 24px) !important; display: none !important; align-items: stretch !important; justify-content: flex-end !important; min-height: " + PROMPT_OVERLAY_ACTION_SIZE + "px !important; border-radius: 999px !important; background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-canvas, Canvas)) !important; box-shadow: 0 0 0 .5px color-mix(in srgb, var(--dsw-alias-border-l2, rgba(127,127,127,.22)) 92%, transparent), 0 3px 12px -6px rgb(0 0 0 / 32%) !important; overflow: hidden !important; padding: 0 !important; }",
				// Hidden by default and expanded on hover/focus. It must be REMOVED from layout while
				// hidden: an opacity-only hide still reserved its row inside the card, which showed up
				// as a permanent blank band under the text.
				overlay + ":hover" + toolbarSuffix + ", " + overlay + ":focus" + toolbarSuffix + ", " + overlay + ":focus-within" + toolbarSuffix + ", " + toolbar + ":focus-within { display: flex !important; animation: " + PROMPT_OVERLAY_STRIP_IN + " .12s ease !important; }",
				// Softens the strip's appearance: revealing it also grows the card, and a hard pop
				// reads as a glitch where a short fade reads as the control sliding in.
				"@keyframes " + PROMPT_OVERLAY_STRIP_IN + " { from { opacity: 0; } to { opacity: 1; } }",
				time + " { margin-right: 3px !important; display: inline-flex !important; align-items: center !important; padding: 0 3px 0 6px !important; color: var(--dsw-alias-text-tertiary, inherit) !important; font-size: " + PROMPT_OVERLAY_TIME_REM + " !important; line-height: 1 !important; white-space: nowrap !important; font-variant-numeric: tabular-nums !important; }",
				// Buttons follow the official Chat control shape: a hairline circle with a dark label tooltip.
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "] { position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: " + PROMPT_OVERLAY_ACTION_SIZE + "px !important; height: " + PROMPT_OVERLAY_ACTION_SIZE + "px !important; padding: 0 !important; border: 0 !important; border-radius: 50% !important; background: transparent !important; color: var(--dsw-alias-text-secondary, inherit) !important; cursor: pointer !important; font-size: .84rem !important; line-height: 1 !important; transition: background .12s ease, color .12s ease, transform .12s ease !important; }",
				// ...and BARE while idle: a permanently drawn hairline circle put two nested
				// outlines inside the pill. The official control only paints a disc while it is
				// hovered or pressed, which is exactly the reference the user compared against.
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "]:hover { background: color-mix(in srgb, var(--dsw-alias-text-secondary, #6b6b70) 14%, transparent) !important; color: var(--dsw-alias-text-primary, inherit) !important; }",
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "]:active { background: color-mix(in srgb, var(--dsw-alias-text-secondary, #6b6b70) 22%, transparent) !important; transform: scale(.94) !important; }",
				// Keyboard reach must stay visible even with the disc gone. Blue, so focus can never
				// be mistaken for the green "copied" state.
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "]:focus-visible { background: color-mix(in srgb, var(--dsw-alias-text-secondary, #6b6b70) 14%, transparent) !important; color: var(--dsw-alias-text-primary, inherit) !important; outline: 2px solid color-mix(in srgb, var(--dsw-alias-text-link, #3b74e0) 72%, transparent) !important; outline-offset: 1px !important; }",
				loadOlder + " { position: relative !important; display: inline-flex !important; align-items: center !important; gap: 4px !important; height: 100% !important; min-height: 24px !important; padding: 0 10px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; color: var(--dsw-alias-text-secondary, #334155) !important; cursor: pointer !important; font-size: .72rem !important; font-weight: 500 !important; line-height: 1 !important; white-space: nowrap !important; transition: background .12s ease, color .12s ease !important; }",
				loadOlder + ":hover { background: color-mix(in srgb, var(--dsw-alias-text-secondary, #6b6b70) 10%, transparent) !important; color: var(--dsw-alias-text-primary, #0f172a) !important; }",
				loadOlder + ":active { background: color-mix(in srgb, var(--dsw-alias-text-secondary, #6b6b70) 18%, transparent) !important; }",
				loadOlder + " [" + PROMPT_OVERLAY_GLYPH_ATTR + "] { display: block !important; width: 11px !important; height: 11px !important; pointer-events: none !important; }",
				divider + " { display: block !important; width: .5px !important; min-width: .5px !important; background: color-mix(in srgb, var(--dsw-alias-border-l2, rgba(127,127,127,.22)) 80%, transparent) !important; margin: 0 !important; align-self: stretch !important; flex-shrink: 0 !important; }",
				overlay + "[" + PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR + "] " + toolbarSuffix + " { display: flex !important; }",
				overlay + "[" + PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR + "] [" + PROMPT_OVERLAY_LOAD_OLDER_ATTR + "] { background: color-mix(in srgb, var(--dsw-alias-text-link, #2563eb) 12%, transparent) !important; color: var(--dsw-alias-text-link, #2563eb) !important; }",
				overlay + "[" + PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR + "] [" + PROMPT_OVERLAY_LOAD_OLDER_ATTR + "]:hover { background: color-mix(in srgb, var(--dsw-alias-text-link, #2563eb) 20%, transparent) !important; }",
				// Confirmed copy: the glyph turns green and NOTHING else changes (the quiet option the
				// user picked). The disc stays suppressed even while hovered, or the state would read
				// as a green check inside a grey circle instead of "only the ✓".
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "][" + PROMPT_OVERLAY_ACTION_DONE_ATTR + "] { color: var(--dsw-alias-text-success, #1f9d55) !important; }",
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "][" + PROMPT_OVERLAY_ACTION_DONE_ATTR + "]:hover, " + toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "][" + PROMPT_OVERLAY_ACTION_DONE_ATTR + "]:focus-visible { background: transparent !important; }",
				// The glyph is the official 16px Chat drawing, in currentColor so the button's own
				// colour rules still drive it.
				toolbar + " [" + PROMPT_OVERLAY_ACTION_ATTR + "] [" + PROMPT_OVERLAY_GLYPH_ATTR + "] { display: block !important; width: " + PROMPT_OVERLAY_ICON_PX + "px !important; height: " + PROMPT_OVERLAY_ICON_PX + "px !important; pointer-events: none !important; }",
				// One tooltip for the whole strip, shown beside it.
				// either over the card's text or over the composer clamp, because the strip sits
				// between them; the strip is right-aligned, so the lane to its left is empty and
				// outside the card. JS copies the hovered button's label into the hint attribute,
				// which also keeps the confirmation text in the active locale.
				toolbar + "[" + PROMPT_OVERLAY_HINT_ATTR + "]:not([" + PROMPT_OVERLAY_HINT_ATTR + "=''])::after { content: attr(" + PROMPT_OVERLAY_HINT_ATTR + ") !important; position: absolute !important; right: calc(100% + 8px) !important; top: 50% !important; transform: translateY(-50%) !important; padding: 3px 8px !important; border-radius: 6px !important; background: rgba(24, 24, 27, .94) !important; color: #fff !important; font-size: .72rem !important; line-height: 1.35 !important; white-space: nowrap !important; pointer-events: none !important; }",
				// One grid for all attachments; the overflow tile is included in its two-row cap.
				attachments + " { display: grid !important; flex: 0 0 auto !important; grid-template-columns: repeat(var(--dsh-desktop-attachment-columns, 1), minmax(0, 1fr)) !important; grid-auto-rows: var(--dsh-desktop-attachment-height, 48px) !important; gap: 6px !important; min-width: 0 !important; min-height: 0 !important; overflow: hidden !important; }",
				more + " { display: flex !important; align-items: center !important; justify-content: center !important; gap: 5px !important; box-sizing: border-box !important; min-width: 0 !important; width: 100% !important; height: var(--dsh-desktop-attachment-height, 48px) !important; overflow: hidden !important; padding: 0 4px !important; border: 1px solid color-mix(in srgb, var(--dsw-alias-accent, #4f8cff) 18%, transparent) !important; border-radius: 9px !important; background: linear-gradient(145deg, color-mix(in srgb, var(--dsw-alias-accent, #4f8cff) 9%, Canvas), color-mix(in srgb, var(--dsw-alias-accent, #4f8cff) 3%, Canvas)) !important; color: var(--dsw-alias-text-secondary, inherit) !important; font-size: .75rem !important; font-weight: 500 !important; font-variant-numeric: tabular-nums !important; white-space: nowrap !important; cursor: default !important; }",
				media + " img, " + media + " video, " + media + " canvas { display: block !important; flex: 0 0 auto !important; width: 100% !important; min-width: 0 !important; height: var(--dsh-desktop-attachment-height, 48px) !important; max-width: 100% !important; max-height: 48px !important; object-fit: cover !important; border-radius: 9px !important; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, Canvas) 88%, transparent) !important; }",
				// Thumbnails open the official viewer, so they read as clickable.
				media + " [role='button'] { cursor: pointer !important; transition: filter .12s ease, transform .12s ease !important; }",
				media + " [role='button']:hover { filter: brightness(1.06) !important; }",
				media + " [role='button']:focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-accent, #4f8cff) 70%, transparent) !important; outline-offset: 2px !important; }",
				files + " > span[" + PROMPT_OVERLAY_ITEM_ATTR + "] { display: inline-flex !important; align-items: center !important; gap: 6px !important; box-sizing: border-box !important; min-width: 0 !important; max-width: 100% !important; height: var(--dsh-desktop-attachment-height, 30px) !important; overflow: hidden !important; white-space: nowrap !important; padding: 5px 8px !important; border: .5px solid color-mix(in srgb, var(--dsw-alias-border-l2, rgba(127,127,127,.22)) 80%, transparent) !important; border-radius: 9px !important; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2, Canvas) 72%, transparent) !important; color: var(--dsw-alias-text-secondary, inherit) !important; font-size: .78rem !important; line-height: 1.25 !important; }",
				files + " > span[" + PROMPT_OVERLAY_ITEM_ATTR + "]::before { content: \"▧\"; flex: 0 0 auto; opacity: .72; font-size: .9rem; }",
				files + " bdi { display: block !important; flex: 1 1 auto !important; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; unicode-bidi: isolate !important; }",
				files + " > span[" + PROMPT_OVERLAY_ITEM_ATTR + "] > span { flex: 0 0 auto !important; }",
				more + " svg { display: block !important; width: 20px !important; height: 20px !important; flex: 0 1 20px !important; min-width: 12px !important; opacity: .8 !important; }",
				more + " > span { min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; }",
				text + " { display: block !important; min-width: 0 !important; font-size: .86rem !important; white-space: pre-wrap !important; overflow-wrap: anywhere !important; word-break: break-word !important; line-height: 1.45 !important; color: var(--dsw-alias-text-primary, inherit) !important; }",
				overlay + ":focus-visible { outline: 2px solid color-mix(in srgb, var(--dsw-alias-accent, #4f8cff) 70%, transparent) !important; outline-offset: 2px !important; }",
			].join("\n");
		}
		const COMPOSER_COMPACT_ATTR = "data-dsh-desktop-composer-compact";
		function clearComposerCompactMarks(scope) {
			const root = scope || (typeof document !== "undefined" ? document : null);
			if (!root || typeof root.querySelectorAll !== "function") return;
			for (const el of root.querySelectorAll("[" + COMPOSER_COMPACT_ATTR + "]")) {
				if (typeof el.removeAttribute === "function") el.removeAttribute(COMPOSER_COMPACT_ATTR);
			}
		}
		function markComposerCompact() {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
			clearComposerCompactMarks(document);
			const scroll = conversationScrollRoot();
			const candidates = [];
			const areas = document.querySelectorAll("textarea, [contenteditable='true']");
			for (const area of areas) {
				if (!area) continue;
				let host = area.parentElement;
				for (let depth = 0; host && depth < 6; depth += 1, host = host.parentElement) {
					if (!host || host === document.body || host === document.documentElement) break;
					if (scroll && (host === scroll || (typeof scroll.contains === "function" && scroll.contains(host)))) continue;
					const rect = typeof host.getBoundingClientRect === "function" ? host.getBoundingClientRect() : null;
					if (!rect) continue;
					const vh = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 800;
					const height = Number(rect.height) || Math.max(0, Number(rect.bottom) - Number(rect.top)) || 0;
					const width = Number(rect.width) || Math.max(0, Number(rect.right) - Number(rect.left)) || 0;
					if (Number(rect.bottom) >= vh - 48 && height > 40 && height < vh * 0.55) {
						candidates.push({ host, score: width * (1 / Math.max(1, vh - Number(rect.top) || 0)) });
						break;
					}
				}
			}
			candidates.sort((a, b) => b.score - a.score);
			const pick = candidates[0] && candidates[0].host;
			if (pick && typeof pick.setAttribute === "function") pick.setAttribute(COMPOSER_COMPACT_ATTR, "");
		}
		function setHoverMessageActionsAttr(enabled) {
			const root = typeof document === "undefined" ? null : document.documentElement;
			if (!root || typeof root.setAttribute !== "function") return;
			if (enabled) root.setAttribute(HOVER_MESSAGE_ACTIONS_ATTR, "");
			else if (typeof root.removeAttribute === "function") root.removeAttribute(HOVER_MESSAGE_ACTIONS_ATTR);
		}
		function overflowYScrolls(el) {
			if (!el || typeof getComputedStyle !== "function") return false;
			try {
				const y = String(getComputedStyle(el).overflowY || "");
				return y === "auto" || y === "scroll" || y === "overlay";
			} catch {
				return false;
			}
		}
		function isPromptOverlayNode(node) {
			if (!node) return false;
			if (typeof node.closest === "function") return Boolean(node.closest("[" + PROMPT_OVERLAY_ATTR + "]"));
			let cur = node;
			while (cur) {
				if (typeof cur.hasAttribute === "function" && cur.hasAttribute(PROMPT_OVERLAY_ATTR)) return true;
				cur = cur.parentElement;
			}
			return false;
		}
		function promptHasRenderableArea(node) {
			if (!node || typeof node.getBoundingClientRect !== "function") return false;
			try {
				const computed = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
				if (computed && (computed.display === "none" || computed.visibility === "hidden")) return false;
			} catch {}
			const rect = node.getBoundingClientRect();
			const width = Number(rect.width) || Math.max(0, Number(rect.right) - Number(rect.left));
			const height = Number(rect.height) || Math.max(0, Number(rect.bottom) - Number(rect.top));
			return width > 0 && height > 0;
		}
		function promptNodes() {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
			const nodes = document.querySelectorAll("[data-chat-flow-kind=user], [data-chat-flow-kind=steering]");
			const out = [];
			for (const node of nodes) {
				if (!node || isPromptOverlayNode(node)) continue;
				if (typeof node.hasAttribute === "function" && (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true")) continue;
				if (!promptHasRenderableArea(node)) continue;
				out.push(node);
			}
			return out;
		}
		function conversationScrollRoot() {
			if (typeof document === "undefined") return null;
			const probe = promptNodes()[0] || (typeof document.querySelector === "function"
				? document.querySelector("[data-chat-flow-key], [data-chat-flow-kind]")
				: null);
			let el = probe && probe.parentElement;
			while (el && el !== document.documentElement) {
				if (overflowYScrolls(el)) return el;
				el = el.parentElement;
			}
			const page = typeof document.querySelector === "function"
				? document.querySelector("[data-conversation-scroll]")
				: null;
			if (page && overflowYScrolls(page)) return page;
			return document.scrollingElement || document.documentElement;
		}
		function promptScrolledPast(node, top) {
			if (!node || typeof node.getBoundingClientRect !== "function") return false;
			const rect = node.getBoundingClientRect();
			return Number(rect.bottom) <= Number(top) + PROMPT_OVERLAY_EPSILON;
		}
		function pickStickyPrompt(root) {
			if (!root || typeof root.getBoundingClientRect !== "function") return null;
			const rootRect = root.getBoundingClientRect();
			const top = Number(rootRect.top) || 0;
			const bottom = Number(rootRect.bottom) > top
				? Number(rootRect.bottom)
				: top + (Number(root.clientHeight) || (typeof window !== "undefined" && Number(window.innerHeight) > top ? Number(window.innerHeight) - top : 0));
			const prompts = promptNodes();
			let candidate = null;
			let passedVisibleBoundary = false;
			const visible = [];
			for (const node of prompts) {
				if (!node || typeof node.getBoundingClientRect !== "function") continue;
				const rect = node.getBoundingClientRect();
				if (!passedVisibleBoundary && promptScrolledPast(node, top)) {
					candidate = node;
					continue;
				}
				passedVisibleBoundary = true;
				if (Number(rect.bottom) > top + PROMPT_OVERLAY_EPSILON && Number(rect.top) < bottom - PROMPT_OVERLAY_EPSILON) visible.push({ node, rect });
			}
			// Two prompt bubbles in the viewport are already enough context; never add a third visual layer.
			if (visible.length > 1) return null;
			// The protection band covers the actual top edge, not a source-node marker.
			if (visible.some(({ rect }) => Number(rect.top) < top + PROMPT_OVERLAY_TOP_PROTECTION_PX && Number(rect.bottom) > top + PROMPT_OVERLAY_EPSILON)) return null;
			// If the candidate itself is visible in the viewport, it must never duplicate as a sticky overlay.
			if (candidate && visible.some(({ node }) => node === candidate)) return null;
			return candidate;
		}
		function overlayColumnBounds(root, node) {
			if (!root || typeof root.getBoundingClientRect !== "function") return null;
			let best = null;
			const peers = typeof root.querySelectorAll === "function" ? root.querySelectorAll("[data-chat-flow-kind=assistant]") : [];
			for (const peer of peers || []) {
				if (!peer || typeof peer.getBoundingClientRect !== "function") continue;
				const rect = peer.getBoundingClientRect();
				const width = Number(rect.width) || Math.max(0, Number(rect.right) - Number(rect.left)) || 0;
				if (width < 40) continue;
				if (!best || width > best.width) best = { left: Number(rect.left) || 0, width, element: peer };
			}
			if (best) return best;
			const parent = node && node.parentElement;
			if (parent) {
				const rect = typeof parent.getBoundingClientRect === "function" ? parent.getBoundingClientRect() : null;
				const width = Number(parent.clientWidth) || (rect ? Math.max(0, Number(rect.right) - Number(rect.left)) : 0);
				if (width >= 40) return { left: rect ? Number(rect.left) || 0 : 0, width, element: parent };
			}
			const rect = root.getBoundingClientRect();
			const width = Number(root.clientWidth) || Math.max(0, Number(rect.right) - Number(rect.left)) || 0;
			return width >= 40 ? { left: Number(rect.left) || 0, width, element: root } : null;
		}
		// The card must never cover the Chat composer, so the composer's top edge is the floor
		// for the card height. Walking up a few levels keeps its padding and toolbar in view.
		function composerTopEdge() {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
			let edge = Infinity;
			for (const area of document.querySelectorAll("textarea, [contenteditable='true']")) {
				if (!area) continue;
				// The composer is a wrapper around the field, so take the topmost usable box within
				// a few levels rather than trusting the field element alone.
				let candidate = Infinity;
				let node = area;
				for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
					if (typeof node.getBoundingClientRect !== "function") continue;
					const rect = node.getBoundingClientRect();
					if (!rect) continue;
					const boxTop = Number(rect.top);
					// Derive the height from the edges: an element with no box has top === bottom.
					const boxHeight = Number(rect.height) || Number(rect.bottom) - Number(rect.top);
					if (Number.isFinite(boxTop) && Number.isFinite(boxHeight) && boxHeight > 0) candidate = Math.min(candidate, boxTop);
				}
				if (Number.isFinite(candidate)) edge = Math.min(edge, candidate);
			}
			return Number.isFinite(edge) ? edge : null;
		}
		// The composer's horizontal extent: the box the user sees around the input field. The
		// field itself is only the inner area, so walk up a few levels and take the widest box
		// that is still narrower than the pane — an ancestor at pane width is the scroll
		// container, not the composer.
		function composerBounds(root) {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
			let paneWidth = 0;
			if (root && typeof root.getBoundingClientRect === "function") {
				const rect = root.getBoundingClientRect();
				paneWidth = Number(root.clientWidth) || Math.max(0, Number(rect.right) - Number(rect.left)) || 0;
			}
			let best = null;
			for (const area of document.querySelectorAll("textarea, [contenteditable='true']")) {
				if (!area) continue;
				let node = area;
				for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
					if (typeof node.getBoundingClientRect !== "function") continue;
					const rect = node.getBoundingClientRect();
					if (!rect) continue;
					// A fake/empty box has no width field, so fall back to the edges.
					const width = Number(rect.width) || Math.max(0, Number(rect.right) - Number(rect.left)) || 0;
					if (width < 40) continue;
					if (paneWidth > 0 && width > paneWidth * 0.95) continue;
					if (!best || width > best.width) best = { left: Number(rect.left) || 0, width, element: node };
				}
			}
			return best;
		}
		// DSH owns the older-history control. Find it structurally instead of matching one locale's
		// label, so the overlay can reserve its lane without replacing or duplicating the native UI.
		function officialLoadOlderButton(root) {
			if (!root || typeof document === "undefined") return null;
			const buttons = typeof root.querySelectorAll === "function"
				? root.querySelectorAll("button")
				: (typeof document.querySelectorAll === "function" ? document.querySelectorAll("button") : []);
			for (const button of buttons) {
				if (!button || isPromptOverlayNode(button)) continue;
				let parent = button.parentElement;
				for (let depth = 0; parent && parent !== root && depth < 5; depth += 1, parent = parent.parentElement) {
					if (hasPreviewClass(parent, "older") || parent.hasAttribute?.("data-chat-load-older")) return button;
				}
				const label = normalizePreviewText(button.textContent || button.innerText || "");
				if (/load\s+older|加载更早/i.test(label)) return button;
			}
			return null;
		}
		function isOfficialLoadOlderEncountered(root, rootRect, left, width, top, floor) {
			const button = officialLoadOlderButton(root);
			if (!button || typeof button.getBoundingClientRect !== "function") return false;
			const rect = button.getBoundingClientRect() || {};
			const buttonTop = Number(rect.top);
			const buttonBottom = Number(rect.bottom);
			const buttonLeft = Number(rect.left);
			const buttonRight = Number(rect.right);
			if (!(buttonBottom > buttonTop) || !Number.isFinite(buttonBottom) || !Number.isFinite(buttonTop)) return false;
			if (buttonBottom <= Number(rootRect.top) || buttonTop >= floor) return false;
			return buttonRight > left && buttonLeft < left + width;
		}
		function computeOverlayMetrics(root, node) {
			if (!root || typeof root.getBoundingClientRect !== "function") return null;
			const rootRect = root.getBoundingClientRect();
			let top = Math.max(0, Number(rootRect.top) || 0);
			const paneLeft = Number(rootRect.left) || 0;
			const paneWidth = Number(root.clientWidth) || Math.max(0, Number(rootRect.right) - paneLeft) || 0;
			const inset = 8;
			const available = Math.max(1, paneWidth - inset * 2);
			const maxWidth = available;
			const paneRight = paneLeft + paneWidth - inset;
			// Prefer the composer: matching the input box keeps the card aligned with the control
			// the user is looking at, and follows the pane when it is widened or compacted.
			const composerBox = composerBounds(root);
			const column = composerBox ? null : overlayColumnBounds(root, node);
			let left;
			let width;
			if (composerBox) {
				left = composerBox.left;
				width = composerBox.width;
			} else if (column) {
				left = column.left;
				width = column.width;
			} else {
				left = paneLeft + inset;
				width = available;
			}
			const minLeft = paneLeft + inset;
			left = Math.max(left, minLeft);
			width = Math.min(Math.max(1, width), available);
			// Keep the left anchor and give back width instead: moving the card left is exactly the
			// overflow this function exists to avoid. Only a column wider than the whole pane can
			// reach here, and then a narrower card is the correct degradation.
			if (left + width > paneRight) width = Math.max(1, paneRight - left);
			const viewportHeight = typeof window !== "undefined" && Number(window.innerHeight) > 0 ? Number(window.innerHeight) : Math.max(1, Number(rootRect.bottom) || 1);
			const composer = composerTopEdge();
			const floor = composer !== null && composer > top ? composer : viewportHeight;
			const encounterOlder = isOfficialLoadOlderEncountered(root, rootRect, left, width, top, floor);
			const availHeight = Math.max(1, floor - top - 8);
			return { top, left, width, maxWidth, availHeight, encounterOlder, widthTarget: composerBox?.element || column?.element || root };
		}
		function applyOverlayStyle(host, metrics, extras) {
			if (!host || !host.style || !metrics) return;
			const set = (prop, value) => {
				if (typeof host.style.setProperty === "function") host.style.setProperty(prop, value, "important");
				else host.style[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
			};
			set("top", metrics.top + "px");
			set("left", metrics.left + "px");
			set("width", metrics.width + "px");
			set("max-width", metrics.maxWidth + "px");
			// No inline max-height: an inline declaration with !important OUTRANKS the stylesheet's
			// !important clamp, so setting it here silently disabled the line budget and left the
			// card capped only by the composer gap (the reported "I set 2 lines but it shows many").
			// The stylesheet owns the height, capping at min(avail, line budget + attachments).
			// The card height is the configured prompt-line budget plus whatever the attachments
			// occupy. The CSS calc keeps rem math in the browser; the avail var is the hard cap.
			set("--dsh-desktop-prompt-overlay-lines", String(promptOverlayMaxLines()));
			set("--dsh-desktop-prompt-overlay-extra", Math.max(0, Number(extras) || 0) + "px");
			set("--dsh-desktop-prompt-overlay-avail", Math.max(1, metrics.availHeight) + "px");
		}

        const PREVIEW_ACTION_ROLES = new Set(["button", "menuitem", "checkbox", "radio", "switch", "tab"]);
        // Extensions decide whether a clickable element that wraps an image is a thumbnail
        // (the image IS the content) or a file card (the image is just a type icon).
        // Upstream action labels, in the languages DSH ships. Used only to decide whether a
        // media-wrapping control is a message action or an attachment.
        const PREVIEW_ACTION_LABEL = /复制|复制全文|编辑|重试|重新生成|分支|删除|撤销|copy|edit|retry|regenerate|branch|delete|undo|duplicate/i;
        const PREVIEW_IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)(?![a-z0-9])/i;
        const PREVIEW_FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|tsv|zip|tar|gz|rar|7z|txt|md|json|ya?ml|go|ts|tsx|js|jsx|py|rs|rb|java|c|cpp|h|sh|sql|log|mp4|mov|webm|m4v|mp3|wav|m4a|flac)(?![a-z0-9])/i;
        function previewAttr(node, name) {
            return node && typeof node.getAttribute === "function" ? String(node.getAttribute(name) || "").trim() : "";
        }
        function previewTag(node) {
            return String(node && node.tagName || "").toUpperCase();
        }
        function normalizePreviewText(value) {
            return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        }
        function isTimestampText(value) {
            const text = normalizePreviewText(value).replace(/\s+/g, " ");
            if (!text || text.length > 64) return false;
            return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)
                || /^\d{1,2}[月/-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)
                || /^\d{4}[年/-]\d{1,2}[月/-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text)
                || /^[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*|\s+)\d{4}(?:\s+\d{1,2}:\d{2})?$/.test(text);
        }
        function isPreviewMedia(node) {
            return ["IMG", "VIDEO", "CANVAS"].includes(previewTag(node));
        }
        function hasPreviewMediaDescendant(node) {
            for (const child of node?.childNodes || []) {
                if (isPreviewMedia(child) || hasPreviewMediaDescendant(child)) return true;
            }
            return false;
        }
        function isPreviewImageName(name) {
            return PREVIEW_IMAGE_EXT.test(String(name || ""));
        }
        function isPreviewFileName(name) {
            return PREVIEW_FILE_EXT.test(String(name || ""));
        }
        // A clickable element that WRAPS an image is normally a thumbnail: DSH renders image
        // attachments as a button/role=button carrying a native filename tooltip (e.g.
        // "image.png，点击查看原图") around the <img>. Treating it as an operation hid the
        // thumbnail AND proxied the attachment into the action strip. Only claim it as an
        // attachment with real evidence, so an icon-bearing action button stays an action.
        function looksLikeAttachmentGroup(node) {
            if (!node || !hasPreviewMediaDescendant(node)) return false;
            // An explicit action marker always wins: this is a control, not an attachment.
            if (previewAttr(node, "data-action") || previewAttr(node, "data-operation")) return false;
            for (const name of ["data-attachment", "data-file", "data-upload", "data-filename", "data-file-name", "data-mime", "data-content-type"]) {
                if (typeof node.hasAttribute === "function" && node.hasAttribute(name)) return true;
            }
            const label = normalizePreviewText(previewAttr(node, "data-filename") || previewAttr(node, "data-file-name") || previewAttr(node, "aria-label") || previewAttr(node, "title") || "");
            if (isPreviewImageName(label) || isPreviewFileName(label)) return true;
            const hints = [previewAttr(node, "class"), previewAttr(node, "data-testid")].join(" ").toLowerCase();
            if (/attachment|upload|thumbnail/.test(hints)) return true;
            // Default to content: a media wrapper with no label, or with a label that does not
            // read like a message action, is an attachment. Upstream may put the filename on an
            // inner element, and missing a thumbnail is far worse than hiding an icon button.
            return !PREVIEW_ACTION_LABEL.test(label);
        }
        function hasPreviewClass(node, suffix) {
            return previewAttr(node, "class").split(/\s+/).some((token) => token === suffix || token.endsWith("_" + suffix));
        }
        function isNativePreviewFile(node) {
            if (!hasPreviewClass(node, "fileCard")) return false;
            for (let parent = node.parentElement; parent; parent = parent.parentElement) {
                if (parent.hasAttribute?.("data-message-attachments") || hasPreviewClass(parent, "attachmentRow")) return true;
                if (parent.hasAttribute?.("data-chat-flow-kind")) break;
            }
            return false;
        }
        function isPreviewAttachment(node) {
            if (!node || !node.tagName || isPreviewMedia(node)) return false;
            if (node.hasAttribute?.("data-action") || node.hasAttribute?.("data-operation")) return false;
            // The row is a container, never a file. Ordinary prose (including paths and titles)
            // supplies no attachment evidence; only actual cards or explicit metadata do.
            if (node.hasAttribute?.("data-message-attachments") || hasPreviewClass(node, "attachmentRow")) return false;
            if (isNativePreviewFile(node)) return true;
            const named = previewAttr(node, "data-filename") || previewAttr(node, "data-file-name");
            if (hasPreviewMediaDescendant(node)) {
                // Explicit file names can describe a type icon; otherwise descend to images.
                return Boolean(named && isPreviewFileName(named) && !isPreviewImageName(named));
            }
            return ["data-attachment", "data-file", "data-upload", "data-filename", "data-file-name", "data-mime", "data-content-type"]
                .some((name) => node.hasAttribute?.(name));
        }
        function safePreviewFileLabel(value) {
            // Make invisible direction/control characters visible instead of letting a filename
            // spoof an extension or reorder adjacent labels. Never interpret path/URL syntax.
            return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
                (char) => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
        }
        function previewAttachmentLabel(node) {
            return normalizePreviewText(previewAttr(node, "data-filename") || previewAttr(node, "data-file-name") || previewAttr(node, "title") || previewAttr(node, "aria-label") || node?.textContent || t("bridge.overlay_attachment"));
        }
        function isPreviewOperation(node) {
            if (!node || !node.tagName) return false;
            const tag = previewTag(node);
            const role = previewAttr(node, "role").toLowerCase();
            if (tag === "TIME" || isTimestampText(node.textContent)) return true;
            if (tag === "BUTTON" || tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || PREVIEW_ACTION_ROLES.has(role)) return true;
            if (node.hasAttribute?.("data-action") || node.hasAttribute?.("data-operation")) return true;
            if ((tag === "A" || tag === "SPAN") && (previewAttr(node, "aria-label") || previewAttr(node, "title"))) return true;
            return false;
        }
        function promptIdentity(source) {
            return String(previewAttr(source, "data-chat-flow-key") || previewAttr(source, "data-message-key") || previewAttr(source, "id") || "").trim();
        }
        function promptTurn(source) {
            let node = source;
            while (node) {
                const raw = previewAttr(node, "data-chat-turn");
                const turn = Number(raw);
                if (raw !== "" && Number.isSafeInteger(turn) && turn >= 0) return turn;
                node = node.parentElement;
            }
            return null;
        }
        function normalizedPromptIdentity(value) {
            return normalizePreviewText(value).replace(/\s+/g, " ").trim();
        }
        function promptMatchesHistoryEntry(source, entry) {
            if (!source || !entry) return false;
            const turn = Number(entry.turn);
            const sourceTurn = promptTurn(source);
            // A real turn marker is authoritative. Only nodes without one need the text fallback;
            // otherwise two different turns with identical wording could be mistaken for one.
            if (sourceTurn !== null) return Number.isSafeInteger(turn) && sourceTurn === turn;
            const expected = normalizedPromptIdentity(entry.prompt);
            if (expected.length < 8) return false;
            const actual = normalizedPromptIdentity(collectPromptPreviewParts(source)
                .filter((part) => part.kind === "text")
                .map((part) => part.value)
                .join(" "));
            if (!actual) return false;
            if (actual === expected) return true;
            const prefix = expected.slice(0, Math.min(64, expected.length)).replace(/[.…]+$/, "").trim();
            return prefix.length >= 8 && actual.includes(prefix);
        }
        function outlineEntries(value) {
            if (!Array.isArray(value)) return [];
            return value.filter((entry) => {
                if (!entry || typeof entry !== "object") return false;
                const turn = Number(entry.turn);
                const seq = Number(entry.seq);
                return Number.isSafeInteger(turn) && turn >= 0 && Number.isSafeInteger(seq) && seq >= 0;
            }).map((entry) => ({
                turn: Number(entry.turn),
                seq: Number(entry.seq),
                prompt: typeof entry.prompt === "string" ? entry.prompt : "",
                response: typeof entry.response === "string" ? entry.response : ""
            }));
        }
        // Keep a bounded signature for session hand-off gating. It distinguishes an old prompt
        // node that is still mounted from the same node after DSH rehydrates it with new content,
        // while avoiding a full DOM serialization on every animation frame.
        function promptRenderSignature(source) {
            if (!source) return "";
            const parts = [];
            const attrs = [
                "data-chat-flow-key", "data-chat-turn", "data-message-key", "data-filename", "data-file-name",
                "data-file-path", "data-attachment", "data-mime", "title", "alt", "src",
                "aria-label"
            ];
            let visited = 0;
            const walk = (node) => {
                if (!node || visited >= 256) return;
                visited += 1;
                const values = attrs.map((name) => previewAttr(node, name)).filter(Boolean);
                const text = normalizePreviewText(node.textContent || "").slice(0, 512);
                parts.push(previewTag(node) + "|" + values.join("\u001f") + "|" + text);
                for (const child of node.childNodes || []) walk(child);
            };
            walk(source);
            return parts.join("\u001e").slice(0, 16000);
        }
        function hasPromptRelation(node, source) {
            const key = promptIdentity(source);
            if (!node || !key) return false;
            const accepted = new Set([key]);
            const sourceId = previewAttr(source, "id");
            if (sourceId) accepted.add(sourceId);
            let cur = node;
            while (cur) {
                for (const name of ["data-chat-flow-key", "data-message-key", "data-chat-flow-for", "data-message-for", "aria-controls", "aria-labelledby"]) {
                    const value = previewAttr(cur, name);
                    if (value && value.split(/[\s,]+/).some((part) => accepted.has(part))) return true;
                }
                cur = cur.parentElement;
            }
            return false;
        }
        // The overlay renders read-only clones, so a click must be forwarded to the official
        // media element. DSH opens its image viewer from that element, so clicking the native
        // node reproduces the native "click to zoom" behaviour without copying any of it.
        function nativeMediaTarget(source, media) {
            // A stale proxy fails closed; never resolve a different attachment by name or URL.
            if (!source || !media || !source.contains?.(media)) return null;
            // DSH normally opens the viewer from the control that WRAPS the image, so click
            // that when it exists and fall back to the image itself.
            let node = media.parentElement;
            while (node && node !== source) {
                const tag = previewTag(node);
                const role = previewAttr(node, "role").toLowerCase();
                if (tag === "BUTTON" || tag === "A" || role === "button") return node;
                node = node.parentElement;
            }
            return media;
        }
        function collectNativeOperationControls(source) {
            if (!source) return [];
            const out = [];
            const seen = new Set();
            const add = (node) => {
                // Attachments must never be proxied into the action strip, even when the
                // official element is a button carrying a filename tooltip.
                if (!node || seen.has(node) || isPreviewAttachment(node) || looksLikeAttachmentGroup(node) || previewTag(node) === "TIME" || isTimestampText(node.textContent) || !isPreviewOperation(node)) return;
                seen.add(node);
                out.push(node);
            };
            const walk = (node) => {
                for (const child of node?.childNodes || []) {
                    add(child);
                    walk(child);
                }
            };
            walk(source);
            const key = promptIdentity(source);
            if (key && typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
                for (const node of document.querySelectorAll("button, a, [role='button'], [role='menuitem'], [data-action], [data-operation]")) {
                    if (!node || (source.contains && source.contains(node)) || isPromptOverlayNode(node)) continue;
                    if (hasPromptRelation(node, source)) add(node);
                }
            }
            return out;
        }
        function operationLabel(node) {
            const fallback = t("bridge.overlay_action");
            return normalizePreviewText(previewAttr(node, "aria-label") || previewAttr(node, "title") || previewAttr(node, "data-action") || previewAttr(node, "data-operation") || node?.textContent || fallback).slice(0, 48) || fallback;
        }
        function operationSignature(node) {
            for (const name of ["data-action", "data-operation", "data-testid", "aria-label", "title"]) {
                const value = previewAttr(node, name);
                if (value) return name + ":" + value;
            }
            return "text:" + operationLabel(node);
        }
        // Whether a native action is the copy control. Used to hide copy on an attachment-only
        // prompt: there is no text to copy, and official Chat does not offer it there either.
        function isCopyOperation(label) {
            return /复制|copy/i.test(String(label || ""));
        }
        function actionGlyph(label) {
            // Copy is drawn with the official Chat path; the rest keep a text glyph because no
            // official path was extracted for them, and a wrong drawing is worse than a plain one.
            if (isCopyOperation(label)) return { path: PROMPT_OVERLAY_ICON_COPY, text: "⧉" };
            if (/编辑|edit/i.test(label)) return { path: "", text: "✎" };
            if (/重试|重新生成|retry|regenerate/i.test(label)) return { path: "", text: "↻" };
            if (/分支|branch/i.test(label)) return { path: "", text: "⑂" };
            return { path: "", text: "⋯" };
        }
        // One filled official path inside a 16x16 viewBox. createElementNS (not innerHTML) because
        // the Chat page may enforce Trusted Types, where an innerHTML assignment throws.
        function promptGlyphNode(path) {
            if (!path || typeof document === "undefined" || typeof document.createElementNS !== "function") return null;
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            if (!svg || typeof svg.setAttribute !== "function") return null;
            svg.setAttribute("viewBox", "0 0 16 16");
            svg.setAttribute("fill", "none");
            svg.setAttribute("aria-hidden", "true");
            svg.setAttribute("focusable", "false");
            svg.setAttribute(PROMPT_OVERLAY_GLYPH_ATTR, "");
            const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
            if (!shape || typeof shape.setAttribute !== "function") return null;
            shape.setAttribute("d", path);
            shape.setAttribute("fill", "currentColor");
            svg.appendChild(shape);
            return svg;
        }
        // Draws the glyph, falling back to the text form when the engine has no SVG support or no
        // official path is known for this action.
        function setActionGlyph(button, glyph) {
            if (!button || typeof button.setAttribute !== "function") return;
            const spec = glyph && typeof glyph === "object" ? glyph : { path: "", text: String(glyph || "") };
            clearElementChildren(button);
            const node = promptGlyphNode(spec.path);
            if (node) {
                button.appendChild(node);
                return;
            }
            button.textContent = spec.text;
        }
        function collectPromptTimes(source) {
            const out = [];
            const seen = new Set();
            const walk = (node) => {
                for (const child of node?.childNodes || []) {
                    const tag = previewTag(child);
                    const text = normalizePreviewText(child?.textContent || "");
                    if ((tag === "TIME" || isTimestampText(text)) && !seen.has(text)) {
                        seen.add(text);
                        out.push(text);
                    }
                    walk(child);
                }
            };
            walk(source);
            return out;
        }
        function resolveNativeOperation(descriptor, state) {
            if (!descriptor || !state?.source) return null;
            const current = descriptor.target;
            if (current && isPreviewOperation(current) && !isPreviewAttachment(current) && (state.source.contains?.(current) || hasPromptRelation(current, state.source))) return current;
            const matches = collectNativeOperationControls(state.source).filter((node) => operationSignature(node) === descriptor.signature);
            return matches.length === 1 ? matches[0] : null;
        }
        // Confirmed actions are tracked per operation signature, not per button: proxying an
        // official control makes DSH re-render the message, which rebuilds the card and would
        // otherwise wipe the confirmation on the very next frame. An entry also lets a fresh
        // button re-render already-confirmed, so one click is enough (no double-click needed).
        const promptActionConfirmations = new Map();
        let promptOverlayRefresh = null;
        function promptActionConfirmed(signature) {
            const until = promptActionConfirmations.get(signature);
            if (!until) return false;
            if (Date.now() >= until) {
                promptActionConfirmations.delete(signature);
                return false;
            }
            return true;
        }
        function markPromptActionDone(button, confirmLabel, signature) {
            if (signature) {
                promptActionConfirmations.set(signature, Date.now() + PROMPT_OVERLAY_ACTION_DONE_MS);
                if (typeof setTimeout === "function") {
                    setTimeout(() => {
                        if (promptActionConfirmations.get(signature) === undefined) return;
                        promptActionConfirmations.delete(signature);
                        // Rebuild so the button returns to its normal glyph.
                        if (typeof promptOverlayRefresh === "function") promptOverlayRefresh();
                    }, PROMPT_OVERLAY_ACTION_DONE_MS);
                }
            }
            if (!button || typeof button.setAttribute !== "function") return;
            // The label is carried as the attribute value so the CSS tooltip stays locale-free.
            if (confirmLabel) button.setAttribute(PROMPT_OVERLAY_ACTION_DONE_ATTR, confirmLabel);
            // Official Chat swaps to its own check drawing, so the overlay does too.
            setActionGlyph(button, { path: PROMPT_OVERLAY_ICON_CHECK, text: "✓" });
        }
        function isPromptTextTruncated(source, state) {
            if (!source) return false;
            if (typeof source.hasAttribute === "function" && source.hasAttribute("data-dsh-desktop-history-preview")) return true;
            const parts = collectPromptPreviewParts(source);
            if (parts.some((p) => p.kind === "text" && /[.…]{2,}$/.test(p.value))) return true;
            const text = normalizePreviewText(source.textContent || "");
            if (/[.…]{2,}$/.test(text)) return true;
            if (state && state.body) {
                if (typeof state.body.hasAttribute === "function" && state.body.hasAttribute(PROMPT_OVERLAY_MORE_BELOW_ATTR)) return true;
                const scrollH = Number(state.body.scrollHeight) || 0;
                const clientH = Number(state.body.clientHeight) || 0;
                if (scrollH > clientH + 2) return true;
            }
            return false;
        }
        function shouldShowLoadOlder(source, state) {
            if (!source) return false;
            // 1. 遇到 DSH Web 原生“加载更早”（encounterOlder）时：即使提示词没有截断（短提示词），
            // 悬浮框也必须提供“加载更早”入口，避免遮盖原生按钮后用户无法拉取更早记录
            if (state && state.encounterOlder) return true;
            // 2. 当前消息确实处于截断状态（未水合摘要、省略号、或高度预算溢出淡出）时，
            // 检查当前会话是否确实存在更早历史可供加载
            if (isPromptTextTruncated(source, state)) {
                const root = conversationScrollRoot();
                const hasOlderButton = Boolean(root && officialLoadOlderButton(root));
                const hasOlderTarget = Boolean(state?.hasOlderTarget);
                const hasMore = Boolean(state?.hasMore);
                return hasOlderButton || hasOlderTarget || hasMore;
            }
            // 3. 中段阅读且提示词完整未截断：严格互斥隐藏，绝不展示“加载更早”
            return false;
        }
        function createPromptToolbar(source, state) {
            const times = collectPromptTimes(source);
            // Copy is dropped when the card mirrors no text at all (an image/file-only prompt has
            // nothing to copy). Upstream would not offer it there either, but the card must not
            // re-introduce it just because the official strip happened to be rendered.
            const hasText = !(state && state.hasText === false);
            const controls = collectNativeOperationControls(source)
                .filter((target) => hasText || !isCopyOperation(operationLabel(target)));
            const showOlder = shouldShowLoadOlder(source, state);
            if (!times.length && !controls.length && !showOlder) return null;
            const toolbar = document.createElement("div");
            toolbar.setAttribute(PROMPT_OVERLAY_TOOLBAR_ATTR, "");
            toolbar.setAttribute("aria-label", t("bridge.overlay_toolbar"));
            // 1. Load-older button on the far left of the toolbar
            if (showOlder) {
                const olderBtn = document.createElement("button");
                olderBtn.setAttribute("type", "button");
                olderBtn.setAttribute(PROMPT_OVERLAY_LOAD_OLDER_ATTR, "");
                olderBtn.setAttribute("aria-label", t("bridge.overlay_load_older"));
                const glyphNode = promptGlyphNode(PROMPT_OVERLAY_ICON_LOAD_OLDER);
                if (glyphNode) olderBtn.appendChild(glyphNode);
                const span = document.createElement("span");
                span.textContent = t("bridge.overlay_load_older");
                olderBtn.appendChild(span);
                olderBtn.addEventListener("click", (event) => {
                    event.preventDefault?.();
                    event.stopPropagation?.();
                    if (olderBtn.disabled) return;
                    olderBtn.disabled = true;
                    span.textContent = t("bridge.overlay_loading");
                    try {
                        if (typeof state?.onLoadOlder === "function") {
                            state.onLoadOlder();
                        } else {
                            const root = conversationScrollRoot();
                            const officialBtn = officialLoadOlderButton(root);
                            if (officialBtn && typeof officialBtn.click === "function") {
                                officialBtn.click();
                            }
                        }
                    } catch (_) {}
                    setTimeout(() => {
                        olderBtn.disabled = false;
                        span.textContent = t("bridge.overlay_load_older");
                    }, 1200);
                });
                toolbar.appendChild(olderBtn);

                // Divider when there are also times or action buttons
                if (times.length > 0 || controls.length > 0) {
                    const divider = document.createElement("span");
                    divider.setAttribute(PROMPT_OVERLAY_DIVIDER_ATTR, "");
                    toolbar.appendChild(divider);
                }
            }
            // 2. Metadata time
            if (times.length) {
                const time = document.createElement("time");
                time.setAttribute(PROMPT_OVERLAY_TIME_ATTR, "");
                time.textContent = times[0];
                toolbar.appendChild(time);
            }
            for (const target of controls) {
                const label = operationLabel(target);
                const button = document.createElement("button");
                button.setAttribute("type", "button");
                button.setAttribute(PROMPT_OVERLAY_ACTION_ATTR, "");
                button.setAttribute("aria-label", label);
                const signature = operationSignature(target);
                const confirmLabel = /复制|copy/i.test(label) ? t("bridge.overlay_copied") : "";
                // A rebuilt card must keep showing a confirmation that is still within its window.
                if (confirmLabel && promptActionConfirmed(signature)) {
                    button.setAttribute(PROMPT_OVERLAY_ACTION_DONE_ATTR, confirmLabel);
                    setActionGlyph(button, { path: PROMPT_OVERLAY_ICON_CHECK, text: "✓" });
                } else {
                    setActionGlyph(button, actionGlyph(label));
                }
                const showHint = () => {
                    // Read the label at hover time so a confirmation replaces the action name.
                    const text = button.getAttribute(PROMPT_OVERLAY_ACTION_DONE_ATTR) || button.getAttribute("aria-label") || "";
                    if (text) toolbar.setAttribute(PROMPT_OVERLAY_HINT_ATTR, text);
                };
                const hideHint = () => toolbar.removeAttribute?.(PROMPT_OVERLAY_HINT_ATTR);
                button.addEventListener?.("mouseenter", showHint);
                button.addEventListener?.("focus", showHint);
                button.addEventListener?.("mouseleave", hideHint);
                button.addEventListener?.("blur", hideHint);
                const descriptor = { proxy: button, target, signature };
                button.addEventListener?.("click", (event) => {
                    const current = resolveNativeOperation(descriptor, state);
                    if (!current || typeof current.click !== "function") return;
                    event.preventDefault?.();
                    event.stopPropagation?.();
                    try { current.click(); } catch (_) { /* fail closed after an upstream rerender */ }
                    markPromptActionDone(button, confirmLabel, signature);
                });
                toolbar.appendChild(button);
                state.proxyDescriptors.push(descriptor);
            }
            return toolbar;
        }
        function isPreviewTextNode(node) {
            return Boolean(node && (node.nodeType === 3 || (!node.tagName && typeof node.textContent === "string")));
        }
        function appendPreviewText(parts, seen, value) {
            const text = normalizePreviewText(value);
            if (!text || isTimestampText(text)) return;
            const key = text.replace(/\s+/g, " ");
            if (seen.has(key)) return;
            seen.add(key);
            parts.push({ kind: "text", value: text });
        }
        function collectPromptPreviewParts(source) {
            const parts = [];
            const seenText = new Set();
            const seenMedia = new Set();
            const seenFiles = new Set(); // DOM identity, never a display name.
            const addMedia = (node) => {
                const srcset = previewAttr(node, "srcset");
                const firstSrcset = srcset ? srcset.split(",")[0].trim().split(/\s+/)[0] : "";
                const src = previewAttr(node, "src") || previewAttr(node, "data-src") || previewAttr(node, "poster") || firstSrcset;
                if (!src || seenMedia.has(node)) return;
                seenMedia.add(node);
                parts.push({ kind: "media", tag: previewTag(node) === "VIDEO" ? "video" : "img", src, alt: previewAttr(node, "alt"), node });
            };
            const addFile = (node) => {
                const name = previewAttachmentLabel(node);
                if (!name || seenFiles.has(node)) return;
                seenFiles.add(node);
                const path = previewAttr(node, "data-file-path") || previewAttr(node, "data-path");
                parts.push({ kind: "file", value: name, path });
            };
            const visit = (node, isRoot = false) => {
                if (!node) return;
                if (isPreviewTextNode(node)) {
                    appendPreviewText(parts, seenText, node.textContent);
                    return;
                }
                if (isPreviewMedia(node)) {
                    addMedia(node);
                    return;
                }
                if (isPreviewAttachment(node)) {
                    addFile(node);
                    return;
                }
                // A genuine action control is skipped, but one that merely WRAPS an
                // attachment is content: descend so the thumbnail or file chip still renders.
                if (!isRoot && isPreviewOperation(node) && !looksLikeAttachmentGroup(node)) return;
                if (typeof node._textContent === "string" && node._textContent) appendPreviewText(parts, seenText, node._textContent);
                const children = [...(node.childNodes || [])];
                if (children.length) {
                    for (const child of children) visit(child);
                } else if (typeof node.textContent === "string") {
                    appendPreviewText(parts, seenText, node.textContent);
                }
            };
            visit(source, true);
            if (!parts.length) {
                const fallback = normalizePreviewText(source?.innerText || source?.textContent || "");
                if (fallback && !isTimestampText(fallback)) parts.push({ kind: "text", value: fallback });
            }
            return parts;
        }
        function appendPreviewTextNode(host, value) {
            const node = document.createElement("div");
            node.setAttribute(PROMPT_OVERLAY_TEXT_ATTR, "");
            node.textContent = value;
            host.appendChild(node);
        }
        function createAttachmentMore(count) {
            const more = document.createElement("span");
            more.setAttribute(PROMPT_OVERLAY_MORE_ATTR, "");
            more.setAttribute("role", "img");
            more.setAttribute("aria-label", t("bridge.overlay_more", count));
            more.setAttribute("title", t("bridge.overlay_more", count));
            // Layered-card outline + ellipsis: scalable, theme-aware and safe under Trusted Types.
            if (typeof document.createElementNS === "function") {
                const ns = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(ns, "svg");
                svg.setAttribute("viewBox", "0 0 20 20");
                svg.setAttribute("aria-hidden", "true");
                svg.setAttribute("focusable", "false");
                svg.setAttribute("fill", "none");
                svg.setAttribute("stroke", "currentColor");
                svg.setAttribute("stroke-width", "1.35");
                svg.setAttribute("stroke-linecap", "round");
                svg.setAttribute("stroke-linejoin", "round");
                const path = document.createElementNS(ns, "path");
                path.setAttribute("d", "M6 3h9a2 2 0 0 1 2 2v9M5 6h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z");
                svg.appendChild(path);
                for (const x of [6, 9, 12]) {
                    const dot = document.createElementNS(ns, "circle");
                    dot.setAttribute("cx", String(x));
                    dot.setAttribute("cy", "11.5");
                    dot.setAttribute("r", ".65");
                    dot.setAttribute("fill", "currentColor");
                    dot.setAttribute("stroke", "none");
                    svg.appendChild(dot);
                }
                more.appendChild(svg);
            }
            const label = document.createElement("span");
            label.textContent = "+" + count;
            more.appendChild(label);
            return more;
        }
        function attachmentColumns(cardWidth, tileWidth) {
            const contentWidth = Math.max(1, cardWidth - PROMPT_OVERLAY_CONTENT_PAD * 2 - 1);
            return Math.max(1, Math.floor((contentWidth + PROMPT_OVERLAY_THUMB_GAP) / (tileWidth + PROMPT_OVERLAY_THUMB_GAP)));
        }
        function buildPromptPreview(source, state, metrics) {
            if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
            const content = document.createElement("div");
            content.setAttribute(PROMPT_OVERLAY_CONTENT_ATTR, "");
            // Keep the visible preview accessible: it contains focusable thumbnails and a
            // labelled overflow indicator. Hiding an ancestor would mask both from readers.
            // All parts go into the inner scrolling body; the card only supplies padding/chrome.
            const body = document.createElement("div");
            body.setAttribute(PROMPT_OVERLAY_BODY_ATTR, "");
            // Bound here rather than in the caller: every rebuild creates a new body, so the
            // listener has to travel with the element.
            body.addEventListener?.("scroll", () => syncOverlayFade(body));
            content.appendChild(body);
            const parts = collectPromptPreviewParts(source);
            const mediaParts = parts.filter((part) => part.kind === "media");
            const fileParts = parts.filter((part) => part.kind === "file");
            const textParts = parts.filter((part) => part.kind === "text");
            // Allocation and resize invalidation share the exact same width calculation.
            const cardWidth = Number(metrics && metrics.width) || Number(source?.clientWidth) || PROMPT_OVERLAY_MAX_WIDTH_PX;
            // One shared grid: media, files and the overflow indicator consume the same cells.
            const attachments = [...mediaParts, ...fileParts];
            const tileWidth = fileParts.length ? PROMPT_OVERLAY_CHIP_AVG_W : PROMPT_OVERLAY_THUMB_W;
            const columns = attachmentColumns(cardWidth, tileWidth);
            const capacity = columns * PROMPT_OVERLAY_MEDIA_ROWS;
            const visibleCount = attachments.length <= capacity ? attachments.length : capacity - 1;
            const visible = attachments.slice(0, visibleCount);
            const hiddenCount = attachments.length - visible.length;
            const rowHeight = mediaParts.length ? PROMPT_OVERLAY_THUMB_H : PROMPT_OVERLAY_CHIP_ROW_H;
            const attachmentRows = Math.ceil((visible.length + (hiddenCount ? 1 : 0)) / columns);
            if (attachments.length) {
                const row = document.createElement("div");
                row.setAttribute(PROMPT_OVERLAY_ATTACHMENTS_ATTR, "");
                // Retain semantic hooks, but both kinds now refer to the SAME physical grid.
                if (mediaParts.length) row.setAttribute(PROMPT_OVERLAY_MEDIA_ATTR, "");
                if (fileParts.length) row.setAttribute(PROMPT_OVERLAY_FILES_ATTR, "");
                row.style.setProperty("--dsh-desktop-attachment-columns", String(columns));
                row.style.setProperty("--dsh-desktop-attachment-height", rowHeight + "px");
                const counts = new Map();
                const occurrences = new Map();
                for (const part of fileParts) {
                    const label = safePreviewFileLabel(part.path || part.value);
                    counts.set(label, (counts.get(label) || 0) + 1);
                }
                for (const part of visible) {
                    if (part.kind === "media") {
                        const media = document.createElement(part.tag || "img");
                        media.setAttribute(PROMPT_OVERLAY_ITEM_ATTR, "");
                        media.setAttribute("src", part.src);
                        media.setAttribute("alt", part.alt || "");
                        media.setAttribute("role", "button");
                        media.setAttribute("tabindex", "0");
                        media.setAttribute("aria-label", part.alt || t("bridge.overlay_attachment"));
                        const openNative = (event) => {
                            const native = nativeMediaTarget(source, part.node);
                            if (!native || typeof native.click !== "function") return;
                            event.preventDefault?.();
                            event.stopPropagation?.();
                            try { native.click(); } catch (_) { /* fail closed after an upstream rerender */ }
                        };
                        media.addEventListener?.("click", openNative);
                        media.addEventListener?.("keydown", (event) => {
                            if (event.key === "Enter" || event.key === " ") openNative(event);
                        });
                        row.appendChild(media);
                        continue;
                    }
                    const file = document.createElement("span");
                    file.setAttribute(PROMPT_OVERLAY_ITEM_ATTR, "");
                    const fullLabel = safePreviewFileLabel(part.path || part.value);
                    const index = (occurrences.get(fullLabel) || 0) + 1;
                    occurrences.set(fullLabel, index);
                    // Inert text only. The full name remains in the native hover tooltip.
                    const label = document.createElement("bdi");
                    label.textContent = fullLabel;
                    file.appendChild(label);
                    if (counts.get(fullLabel) > 1) {
                        const ordinal = document.createElement("span");
                        ordinal.textContent = " (" + index + "/" + counts.get(fullLabel) + ")";
                        file.appendChild(ordinal);
                    }
                    file.setAttribute("title", fullLabel);
                    row.appendChild(file);
                }
                if (hiddenCount > 0) row.appendChild(createAttachmentMore(hiddenCount));
                body.appendChild(row);
            }
            for (const part of textParts) appendPreviewTextNode(body, part.value);
            if (!mediaParts.length && !fileParts.length && !textParts.length) appendPreviewTextNode(body, t("bridge.overlay_hidden"));
            // The action strip is a SIBLING of the scrolling body, absolutely placed on the last
            // line of the card: it must not scroll with the text, and it must not reserve a row.
            // hasText tells it whether this prompt carries any copyable text at all.
            const toolbar = createPromptToolbar(source, Object.assign({
                proxyDescriptors: [],
                hasText: textParts.length > 0,
            }, state || {}));
            const extra = attachmentRows * rowHeight
                + Math.max(0, attachmentRows - 1) * PROMPT_OVERLAY_THUMB_GAP
                + (attachmentRows ? PROMPT_OVERLAY_THUMB_GAP + PROMPT_OVERLAY_BLOCK_PAD : 0);
            return {
                content,
                body,
                toolbar,
                extra,
                variant: mediaParts.length || fileParts.length ? "rich" : "capsule",
                attachmentLayout: attachments.length ? { columns, tileWidth } : null
            };
        }
        function clearElementChildren(node) {
            if (!node || typeof node.removeChild !== "function") return;
            while (node.firstChild) node.removeChild(node.firstChild);
        }
        function detachOverlayEvents(_host, state) {
            if (state) state.proxyDescriptors = [];
        }
		function removeOverlayHost(state) {
			if (!state || !state.host) return;
			detachOverlayEvents(state.host, state);
			if (state.host.parentNode && typeof state.host.parentNode.removeChild === "function") state.host.parentNode.removeChild(state.host);
			state.host = null;
			state.content = null;
			state.toolbar = null;
			state.source = null;
			state.widthTarget = null;
			state.attachmentLayout = null;
			state.proxyDescriptors = [];
		}
		// Fade the last visible line only while there is more to scroll to. Hiding it at the
		// bottom matters: a permanent fade would keep suggesting content that is no longer there.
		function syncOverlayFade(body) {
			if (!body || typeof body.setAttribute !== "function") return;
			const full = Number(body.scrollHeight) || 0;
			const view = Number(body.clientHeight) || 0;
			const top = Number(body.scrollTop) || 0;
			const moreBelow = full > view + 1 && top + view < full - 2;
			if (moreBelow) body.setAttribute(PROMPT_OVERLAY_MORE_BELOW_ATTR, "");
			else if (typeof body.removeAttribute === "function") body.removeAttribute(PROMPT_OVERLAY_MORE_BELOW_ATTR);
		}
		// Line height of a text element in px, so the last LINE BOX can be located inside a block
		// holding several lines. A zero-height marker would NOT do: an inline box sits on the
		// baseline, which biases every measurement by several px.
		function previewLineHeight(node) {
			if (!node || typeof getComputedStyle !== "function") return PROMPT_OVERLAY_LINE_FALLBACK;
			let style = null;
			try { style = getComputedStyle(node); } catch (_) { style = null; }
			if (!style) return PROMPT_OVERLAY_LINE_FALLBACK;
			const size = Number.parseFloat(style.fontSize);
			const raw = String(style.lineHeight == null ? "" : style.lineHeight);
			const value = Number.parseFloat(raw);
			const fallback = isFinite(size) && size > 0 ? size * 1.2 : PROMPT_OVERLAY_LINE_FALLBACK;
			if (!isFinite(value) || value <= 0) return fallback;                 // "normal"
			if (/%$/.test(raw)) return isFinite(size) && size > 0 ? size * value / 100 : fallback;
			if (/[a-z%]+$/i.test(raw)) return value;                             // already a length
			return isFinite(size) && size > 0 ? value * size : PROMPT_OVERLAY_LINE_FALLBACK;
		}
		// The line the strip must hang on: the LAST LINE BOX of the last text block, or the middle
		// of the last row when the card holds no text (an attachment-only prompt). A row is not a
		// line — that difference is exactly why a flow-row strip drifted a whole row lower there.
		function overlayStripReference(body) {
			if (!body || typeof body.getBoundingClientRect !== "function") return null;
			const children = body.childNodes || [];
			for (let i = children.length - 1; i >= 0; i--) {
				const node = children[i];
				if (!node || typeof node.getBoundingClientRect !== "function") continue;
				if (previewTag(node) === "TIME") continue;
				const rect = node.getBoundingClientRect() || {};
				const top = Number(rect.top);
				const bottom = Number(rect.bottom);
				if (!(bottom > top)) continue;
                if (node.hasAttribute?.(PROMPT_OVERLAY_ATTACHMENTS_ATTR)) {
                    // Two grid rows are one body child. Anchor to the final rendered cell,
                    // including the more tile, instead of the centre between the rows.
                    const cells = node.childNodes || [];
                    for (let j = cells.length - 1; j >= 0; j--) {
                        const cell = cells[j].getBoundingClientRect?.();
                        if (cell && Number(cell.bottom) > Number(cell.top)) {
                            return { centre: (Number(cell.top) + Number(cell.bottom)) / 2, text: false };
                        }
                    }
                }
				const isText = typeof node.hasAttribute === "function" && node.hasAttribute(PROMPT_OVERLAY_TEXT_ATTR);
				return isText
					? { centre: bottom - previewLineHeight(node) / 2, text: true }
					: { centre: top + (bottom - top) / 2, text: false };
			}
			return null;
		}
		// Centres the strip on that reference, then keeps it inside the visible body box, so a last
		// line scrolled out of sight pins the strip to the bottom edge rather than floating it
		// outside the card. Runs on every sync, which is what makes it follow a scroll.
		function positionOverlayStrip(state) {
			const strip = state && state.toolbar;
			const body = state && state.body;
			const host = state && state.host;
			if (!strip || !strip.style || !body || !host) return;
			if (typeof host.getBoundingClientRect !== "function" || typeof strip.getBoundingClientRect !== "function") return;
			const clearTop = () => {
				if (typeof strip.style.removeProperty === "function") strip.style.removeProperty("top");
				else strip.style.top = "";
			};
			const hostRect = host.getBoundingClientRect() || {};
			if (!(Number(hostRect.bottom) > Number(hostRect.top))) { clearTop(); return; }
			const reference = overlayStripReference(body);
			if (!reference) { clearTop(); return; }
			const stripRect = strip.getBoundingClientRect() || {};
			const measured = Number(stripRect.bottom) - Number(stripRect.top);
			// Hidden by default (display: none), so there is no box to measure in the common case;
			// the constant mirrors the strip's own CSS height.
			const height = measured > 4 ? measured : PROMPT_OVERLAY_STRIP_H;
			const bodyRect = body.getBoundingClientRect() || {};
			let top = reference.centre - Number(hostRect.top) - height / 2;
			if (!isFinite(top)) { clearTop(); return; }
			const min = Number(bodyRect.top) - Number(hostRect.top);
			const max = Number(bodyRect.bottom) - Number(hostRect.top) - height;
			if (isFinite(min) && isFinite(max) && max >= min) top = Math.min(Math.max(top, min), max);
			const value = Math.round(top) + "px";
			if (typeof strip.style.setProperty === "function") strip.style.setProperty("top", value, "important");
			else strip.style.top = value;
		}
		function setStickyPrompt(next, root, state) {
			if (typeof document === "undefined" || typeof document.querySelectorAll !== "function" || !state) return;
			for (const host of document.querySelectorAll("[" + PROMPT_OVERLAY_ATTR + "]")) {
				if (host !== state.host && host.parentNode && typeof host.parentNode.removeChild === "function") host.parentNode.removeChild(host);
			}
			if (!next || !root || !document.body || typeof document.createElement !== "function") {
				removeOverlayHost(state);
				return;
			}
			if (state.host && state.host.parentNode !== document.body) removeOverlayHost(state);
			if (!state.host) {
				state.host = document.createElement("div");
				state.host.setAttribute(PROMPT_OVERLAY_ATTR, "");
				state.host.setAttribute("tabindex", "0");
				document.body.appendChild(state.host);
			}
			// Re-applied every paint: the host outlives a language switch, so a label set only
			// at creation could stay in the previous locale.
			state.host.setAttribute("aria-label", t("bridge.overlay_label"));
			// Metrics first: the attachment grid budgets its rows from the card's own resolved
			// width, so the width has to be known before the body is built.
			const metrics = computeOverlayMetrics(root, next);
			state.widthTarget = metrics?.widthTarget || null;
			const encounterOlder = Boolean(metrics?.encounterOlder);
			state.encounterOlder = encounterOlder;
			const showOlder = shouldShowLoadOlder(next, state);
			state.hasOlderAction = showOlder;
			const isLongDisplay = Boolean(encounterOlder && showOlder);
			if (Boolean(state.isLongDisplay) !== isLongDisplay) {
				state.isLongDisplay = isLongDisplay;
				state.needsRefresh = true;
			}
			if (state.host) {
				if (state.isLongDisplay) state.host.setAttribute(PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR, "");
				else if (typeof state.host.removeAttribute === "function") state.host.removeAttribute(PROMPT_OVERLAY_ENCOUNTER_OLDER_ATTR);
			}
			// A locale, line-budget or width change must also re-render the card body.
			const locale = currentLocale();
			const maxLines = promptOverlayMaxLines();
			const layout = state.attachmentLayout;
			// Never miss a column boundary, even when crossed by 1px. Inside a column band,
			// CSS resizes the existing cells without recreating thumbnails or losing focus.
			const widthChanged = Boolean(layout && metrics && attachmentColumns(metrics.width, layout.tileWidth) !== layout.columns);
			let restoreScrollTop = null;
			if (state.source !== next || state.needsRefresh || !state.content || state.locale !== locale || state.maxLines !== maxLines || widthChanged) {
				restoreScrollTop = state.source === next ? Number(state.body?.scrollTop) || 0 : 0;
				clearElementChildren(state.host);
				state.source = next;
				const built = buildPromptPreview(next, state, metrics);
				state.content = built && built.content ? built.content : null;
				state.body = built && built.body ? built.body : null;
				state.toolbar = built && built.toolbar ? built.toolbar : null;
				state.extra = built ? built.extra || 0 : 0;
				if (state.content) state.host.appendChild(state.content);
				// The toolbar is a sibling of the body, not a child, so it never scrolls with it.
				if (state.toolbar) state.host.appendChild(state.toolbar);
				state.needsRefresh = false;
				state.locale = locale;
				state.maxLines = maxLines;
				state.attachmentLayout = built?.attachmentLayout || null;
			}
			applyOverlayStyle(state.host, metrics, state.extra);
			// Restore after sizing so the browser can clamp naturally if the body got shorter.
			if (restoreScrollTop !== null && state.body) state.body.scrollTop = restoreScrollTop;
			// After the size lands: reading the scroller's geometry before this would measure the
			// previous frame's box.
			syncOverlayFade(state.body);
			// Same reason: the strip is centred on a measured line box, so it can only be placed
			// once the card has its final width and height.
			positionOverlayStrip(state);
		}
		function installHoverMessageActions(ctx) {
			if (typeof document === "undefined") return () => {};
			let style = typeof document.querySelector === "function"
				? document.querySelector("style[data-plugin-css=\"" + HOVER_MESSAGE_ACTIONS_STYLE_ID + "\"]")
				: null;
			if (!style && typeof document.createElement === "function") {
				style = document.createElement("style");
				style.dataset.plugin = STYLE_ID;
				style.dataset.pluginCss = HOVER_MESSAGE_ACTIONS_STYLE_ID;
				if (document.head && typeof document.head.appendChild === "function") document.head.appendChild(style);
			}
			let enabled = typeof window === "undefined" ? true : window[HOVER_MESSAGE_ACTIONS_GLOBAL] !== false;
			let frame = 0;
			const initialSessionKey = (() => {
				if (typeof window !== "undefined") {
					const globalId = normalizeActiveSessionId(window[ACTIVE_SESSION_GLOBAL]);
					if (globalId) return globalId;
				}
				try {
					if (typeof localStorage !== "undefined") {
						const parsed = JSON.parse(localStorage.getItem("dsh.sessions.current") || "null");
						return normalizeActiveSessionId(parsed?.sessionId);
					}
				} catch (_) {}
				return "";
			})();
			const state = {
				host: null, content: null, toolbar: null, extra: 0, maxLines: 0, source: null,
				proxyDescriptors: [], needsRefresh: false, syncing: false, pending: false,
				sessionKey: initialSessionKey, awaitingSessionSync: false, stalePrompts: null
			};
			const writeCSS = () => {
				if (!style) return;
				if (document.head && style.parentNode !== document.head && typeof document.head.appendChild === "function") document.head.appendChild(style);
				const css = hoverMessageActionsCSS();
				if (style.textContent !== css) style.textContent = css;
			};
			let observeLayout = () => {};
			const sessionServices = ctx && ctx.sessions;
			const history = {
				sessionId: "",
				session: null,
				outlineFace: null,
				outline: [],
				stopSession: null,
				stopOutline: null,
				loadKey: "",
				loadPromise: null,
				requested: new Set(),
				previewTarget: null,
				previewNode: null,
				previewKey: "",
				boundaryPreviewNode: null,
				boundaryPreviewKey: ""
			};
			const updateHistoryState = () => {
				state.hasOlderTarget = Boolean(history.previewTarget && typeof history.session?.loadThrough === "function");
				state.hasMore = Boolean(history.session?.hasMore);
			};
			state.onLoadOlder = () => {
				const root = conversationScrollRoot();
				const officialBtn = officialLoadOlderButton(root);
				if (officialBtn && typeof officialBtn.click === "function") {
					try { officialBtn.click(); return; } catch (_) {}
				}
				if (history.previewTarget && typeof history.session?.loadThrough === "function") {
					void history.session.loadThrough(history.previewTarget.seq);
					return;
				}
				if (typeof history.session?.loadOlder === "function") {
					void history.session.loadOlder();
				}
			};
			const resolveOverlaySessionId = () => {
				if (typeof window !== "undefined") {
					const globalId = normalizeActiveSessionId(window[ACTIVE_SESSION_GLOBAL]);
					if (globalId) return globalId;
				}
				try {
					const current = sessionServices?.list?.getSnapshot?.()?.current;
					if (current) return String(current).trim();
				} catch (_) {}
				try {
					const uiWorkspace = typeof ctx?.get === "function" ? ctx.get("uiWorkspace") : ctx?.uiWorkspace;
					const current = uiWorkspace?.mainReference?.sessionId || uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
					if (current) return String(current).trim();
				} catch (_) {}
				return "";
			};
			const stopHistoryBinding = () => {
				if (typeof history.stopSession === "function") history.stopSession();
				if (typeof history.stopOutline === "function") history.stopOutline();
				history.stopSession = null;
				history.stopOutline = null;
				history.session = null;
				history.outlineFace = null;
				history.outline = [];
				history.loadKey = "";
				history.loadPromise = null;
				history.requested.clear();
				history.previewTarget = null;
				history.previewNode = null;
				history.previewKey = "";
				history.boundaryPreviewNode = null;
				history.boundaryPreviewKey = "";
			};
			const readHistoryOutline = () => {
				const value = history.outlineFace?.getSnapshot?.() ?? history.session?.projections?.get?.("turnOutline");
				history.outline = outlineEntries(value);
				return history.outline;
			};
			const syncHistoryBinding = () => {
				const sessionId = resolveOverlaySessionId();
				if (!sessionId) {
					if (history.sessionId) stopHistoryBinding();
					history.sessionId = "";
					return;
				}
				if (history.sessionId === sessionId && history.session) {
					readHistoryOutline();
					return;
				}
				stopHistoryBinding();
				history.sessionId = sessionId;
				try {
					history.session = sessionServices?.binding?.(sessionId)?.session || null;
					history.outlineFace = history.session?.projections?.faceOf?.("turnOutline") || null;
					readHistoryOutline();
					const onHistoryChange = () => {
						readHistoryOutline();
						state.needsRefresh = true;
						schedule();
					};
					if (typeof history.outlineFace?.subscribe === "function") history.stopOutline = history.outlineFace.subscribe(onHistoryChange);
					if (typeof history.session?.subscribe === "function") history.stopSession = history.session.subscribe(onHistoryChange);
				} catch (_) {
					stopHistoryBinding();
				}
			};
			const snapshotPromptNodes = () => {
				const snapshot = new Map();
				for (const node of promptNodes()) snapshot.set(node, promptRenderSignature(node));
				return snapshot;
			};
			const invalidateForSession = (value) => {
				const next = normalizeActiveSessionId(value);
				if (state.sessionKey === next) return;
				state.sessionKey = next;
				state.stalePrompts = snapshotPromptNodes();
				state.awaitingSessionSync = state.stalePrompts.size > 0;
				state.needsRefresh = true;
				// Do not let a previous session remain visible while the new history is loading.
				removeOverlayHost(state);
				schedule();
			};
			const acceptFreshSessionPrompt = (candidate) => {
				if (!state.awaitingSessionSync) return candidate;
				if (!candidate) return null;
				const signature = promptRenderSignature(candidate);
				const oldSignature = state.stalePrompts?.get(candidate);
				const isOldNode = state.stalePrompts?.has(candidate);
				const isOldContent = [...(state.stalePrompts?.values() || [])].includes(signature);
				// Virtualized Chat may replace an unchanged old bubble with a new DOM node. Node
				// identity alone is therefore not enough: reject the old signature until the new
				// session either changes its content in place or mounts genuinely new content.
				if ((isOldNode && signature !== oldSignature) || (!isOldNode && !isOldContent)) {
					state.awaitingSessionSync = false;
					state.stalePrompts = null;
					return candidate;
				}
				return null;
			};
			const findOfficialHistoryTarget = () => {
				if (!history.outline.length || typeof document === "undefined" || typeof document.querySelectorAll !== "function") return null;
				const buttons = document.querySelectorAll("button");
				const activeTarget = () => {
					for (const button of buttons) {
						if (previewAttr(button, "aria-current") !== "true") continue;
						const label = previewAttr(button, "aria-label");
						const match = label.match(/(\d+)(?!.*\d)/);
						const turn = match ? Number(match[1]) : NaN;
						const entry = history.outline.find((candidate) => candidate.turn === turn);
						if (entry) return { entry, explicit: false };
					}
					return null;
				};
				const describedBy = new Map();
				for (const button of buttons) {
					const tooltipId = previewAttr(button, "aria-describedby");
					if (tooltipId) describedBy.set(tooltipId, previewAttr(button, "aria-label"));
				}
				if (!describedBy.size) return activeTarget();
				for (const tooltip of document.querySelectorAll("[role=tooltip]")) {
					if (!tooltip || isPromptOverlayNode(tooltip) || tooltip.hasAttribute?.("hidden") || tooltip.getAttribute?.("aria-hidden") === "true") continue;
					const tooltipId = previewAttr(tooltip, "id");
					const label = tooltipId ? describedBy.get(tooltipId) : "";
					if (!label) continue;
					const text = normalizePreviewText(tooltip.textContent || "");
					if (!text) continue;
					const byPrompt = history.outline.find((entry) => {
						const prompt = normalizePreviewText(entry.prompt);
						const prefix = prompt.slice(0, Math.min(40, prompt.length)).replace(/[.…]+$/, "");
						return prefix.length >= 8 && text.includes(prefix);
					});
					if (byPrompt) return { entry: byPrompt, explicit: true };
					const match = label.match(/(\d+)(?!.*\d)/);
					const turn = match ? Number(match[1]) : NaN;
					const byTurn = history.outline.find((entry) => entry.turn === turn);
					if (byTurn) return { entry: byTurn, explicit: true };
				}
				return activeTarget();
			};
			const createHistoryPreview = (entry) => {
				if (!entry || !entry.prompt || typeof document === "undefined" || typeof document.createElement !== "function") return null;
				const key = history.sessionId + ":" + entry.turn + ":" + entry.seq;
				if (history.previewNode && history.previewKey === key) return history.previewNode;
				const preview = document.createElement("div");
				preview.setAttribute("data-chat-flow-kind", "user");
				preview.setAttribute("data-chat-flow-key", "dsh-history-preview-" + key);
				preview.setAttribute("data-chat-turn", String(entry.turn));
				preview.setAttribute("data-dsh-desktop-history-preview", "");
				preview.textContent = entry.prompt;
				history.previewNode = preview;
				history.previewKey = key;
				return preview;
			};
			const requestHistoryTurn = (entry) => {
				const session = history.session;
				if (!session || !entry || typeof session.loadThrough !== "function") return;
				const key = history.sessionId + ":" + entry.turn + ":" + entry.seq;
				if (history.requested.has(key)) return;
				history.requested.add(key);
				history.loadKey = key;
				history.loadPromise = Promise.resolve().then(() => session.loadThrough(entry.seq)).catch(() => {}).finally(() => {
					if (history.loadKey !== key) return;
					history.loadPromise = null;
					state.needsRefresh = true;
					schedule();
				});
			};
			const syncOfficialHistoryPreview = () => {
				const targetInfo = findOfficialHistoryTarget();
				const target = targetInfo?.entry || null;
				if (target) {
					history.previewTarget = target;
					// The active rail marker is passive state. Only an explicit tooltip hover/focus
					// may start a potentially multi-page jump; otherwise use turnOutline text and
					// preserve DSH Web's lazy-history CPU budget.
					if (targetInfo.explicit && !promptNodes().some((node) => promptTurn(node) === target.turn)) requestHistoryTurn(target);
					return target;
				}
				history.previewTarget = null;
				// Keep the lightweight preview node cached. The native-boundary fallback can be
				// selected on consecutive scroll frames; clearing it here would create a fresh DOM
				// source every frame and re-enter MutationObserver-driven sync indefinitely.
				return null;
			};
			// When the native older-history control is visible but no rail tooltip was hovered,
			// content-visibility may leave us without a measurable offscreen DOM candidate. Use the
			// newest outline entry before the visible prompt as a passive text fallback; never choose
			// the same entry as a prompt that is already visible in the conversation.
			const historyBoundaryFallback = (root) => {
				if (!history.outline.length) return null;
				const prompts = promptNodes();
				const rootRect = root && typeof root.getBoundingClientRect === "function" ? root.getBoundingClientRect() : null;
				const top = rootRect ? Number(rootRect.top) || 0 : 0;
				const bottom = rootRect && Number(rootRect.bottom) > top
					? Number(rootRect.bottom)
					: top + (Number(root?.clientHeight) || (typeof window !== "undefined" ? Number(window.innerHeight) || 0 : 0));
				const visible = prompts.filter((node) => {
					if (!node || typeof node.getBoundingClientRect !== "function") return false;
					const rect = node.getBoundingClientRect();
					return Number(rect.bottom) > top + PROMPT_OVERLAY_EPSILON && Number(rect.top) < bottom - PROMPT_OVERLAY_EPSILON;
				});
				const ordered = [...history.outline].sort((a, b) => Number(a.turn) - Number(b.turn));
				const visibleEntries = ordered.filter((entry) => visible.some((node) => promptMatchesHistoryEntry(node, entry)));
				const firstVisibleTurn = visibleEntries.length ? Math.min(...visibleEntries.map((entry) => Number(entry.turn))) : Infinity;
				const candidate = [...ordered].reverse().find((entry) => {
					if (Number(entry.turn) >= firstVisibleTurn) return false;
					return !prompts.some((node) => promptMatchesHistoryEntry(node, entry));
				}) || (!visibleEntries.length ? [...ordered].reverse().find((entry) => !prompts.some((node) => promptMatchesHistoryEntry(node, entry))) : null);
				if (!candidate) return null;
				const key = history.sessionId + ":" + candidate.turn + ":" + candidate.seq + ":" + normalizedPromptIdentity(candidate.prompt);
				if (!history.boundaryPreviewNode || history.boundaryPreviewKey !== key) {
					history.boundaryPreviewNode = createHistoryPreview(candidate);
					history.boundaryPreviewKey = key;
				}
				history.previewTarget = candidate;
				return history.boundaryPreviewNode;
			};
			const historyPreviewSource = (target, root) => {
				if (!target) return null;
				const scrollRoot = root || conversationScrollRoot();
				const top = scrollRoot && typeof scrollRoot.getBoundingClientRect === "function"
					? Number(scrollRoot.getBoundingClientRect().top) || 0
					: 0;
				// DSH's rail metadata is more stable than the message DOM, but it can point at a
				// mounted prompt whose node has no data-chat-turn. Match by turn first and by the
				// normalized prompt text as a fallback so a visible bubble cannot be mirrored above itself.
				const matchingPrompt = promptNodes().find((node) => promptMatchesHistoryEntry(node, target));
				if (matchingPrompt) {
					// A matching bubble that has re-entered the conversation viewport owns the display;
					// only its fully scrolled-past state may be represented by the detached mirror.
					if (!promptScrolledPast(matchingPrompt, top)) return null;
					return matchingPrompt;
				}
				return createHistoryPreview(target);
			};
			// Lets a settled action confirmation rebuild the card to drop its ✓ again.
			promptOverlayRefresh = () => schedule();
			const syncOverlay = () => {
				if (state.syncing) {
					state.pending = true;
					return;
				}
				state.syncing = true;
				try {
					writeCSS();
					if (!enabled) {
						setStickyPrompt(null, null, state);
						clearComposerCompactMarks(document);
						return;
					}
					const root = conversationScrollRoot();
					syncHistoryBinding();
					const historyTarget = state.awaitingSessionSync ? null : syncOfficialHistoryPreview();
					updateHistoryState();
					const rootRect = root && typeof root.getBoundingClientRect === "function" ? root.getBoundingClientRect() : null;
					const boundaryTop = rootRect ? Number(rootRect.top) || 0 : 0;
					const boundaryLeft = rootRect ? Number(rootRect.left) || 0 : 0;
					const boundaryWidth = Number(root?.clientWidth) || (rootRect ? Math.max(0, Number(rootRect.right) - boundaryLeft) : 0);
					const boundaryFloor = rootRect && Number(rootRect.bottom) > boundaryTop ? Number(rootRect.bottom) : boundaryTop;
					// Probe the native boundary before choosing a candidate. This is deliberately cheaper than
					// computeOverlayMetrics(): composer measurement scans the whole document and is not needed
					// to decide whether DSH's own load-older control is currently in the conversation lane.
					const encounterOlder = Boolean(root && rootRect && isOfficialLoadOlderEncountered(root, rootRect, boundaryLeft, boundaryWidth, boundaryTop, boundaryFloor));
					const protectedPrompt = promptNodes().some((node) => {
						const rect = node?.getBoundingClientRect?.();
						return rect && Number(rect.top) < boundaryTop + PROMPT_OVERLAY_TOP_PROTECTION_PX
							&& Number(rect.bottom) > boundaryTop + PROMPT_OVERLAY_EPSILON;
					});
					const historySource = historyPreviewSource(historyTarget, root);
					const stickyCandidate = acceptFreshSessionPrompt(pickStickyPrompt(root));
					const boundarySource = !state.awaitingSessionSync && !protectedPrompt && !historySource && !stickyCandidate && encounterOlder
						? historyBoundaryFallback(root)
						: null;
					const rawCandidate = historySource || stickyCandidate || boundarySource;
					const topEdge = root && typeof root.getBoundingClientRect === "function"
						? Number(root.getBoundingClientRect().top) || 0
						: 0;
					// Mutual exclusion: if candidate is a loaded DOM prompt in the chat, it must only
					// appear as a sticky overlay when it has scrolled past the top of the viewport.
					// When the prompt bubble is still in the chat view, the overlay must yield.
					const candidate = rawCandidate && rawCandidate.hasAttribute?.("data-dsh-desktop-history-preview")
						? rawCandidate
						: (rawCandidate && !promptScrolledPast(rawCandidate, topEdge) ? null : rawCandidate);
					setStickyPrompt(candidate, candidate ? root : null, state);
					markComposerCompact();
					observeLayout();
				} finally {
					state.syncing = false;
					if (state.pending) {
						state.pending = false;
						schedule();
					}
				}
			};
			const schedule = () => {
				if (typeof requestAnimationFrame === "function") {
					if (frame) return;
					frame = requestAnimationFrame(() => {
						frame = 0;
						syncOverlay();
					});
					return;
				}
				syncOverlay();
			};
			const applyEnabled = (value) => {
				enabled = value !== false;
				setHoverMessageActionsAttr(enabled);
				writeCSS();
				if (enabled) schedule();
				else { setStickyPrompt(null, null, state); observeLayout(); }
			};
			applyEnabled(enabled);
			const onSettingChange = (event) => applyEnabled(event.detail !== false);
			const onSessionChange = (event) => invalidateForSession(event?.detail);
			const onOfficialPreview = (event) => {
				const target = event?.target;
				// Pointer/focus changes inside our detached card are not official rail preview changes.
				// Re-running selection there can swap the source under the pointer and restart the
				// toolbar reveal animation, which appears as copy/time flicker on first hover.
				if (state.host && target && (target === state.host || state.host.contains?.(target))) return;
				// Pointer events are noisy around the animated capsule: entering the native load-older
				// action must not be mistaken for hovering DSH's official history preview. Only let
				// pointerover/pointermove from an official history control refresh selection; focus events
				// still handle keyboard entry into the control and tooltip itself.
				if ((event?.type === "pointerover" || event?.type === "pointermove") && target) {
					const control = typeof target.closest === "function"
						? target.closest("button, [role='button'], [role='tooltip']")
						: null;
					const official = control && (
						previewAttr(control, "aria-current") === "true"
						|| Boolean(previewAttr(control, "aria-describedby"))
						|| previewAttr(control, "role") === "tooltip"
					);
					if (!official) return;
				}
				schedule();
			};
			const onScroll = () => schedule();
			if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
				window.addEventListener(HOVER_MESSAGE_ACTIONS_EVENT, onSettingChange);
				window.addEventListener(ACTIVE_SESSION_EVENT, onSessionChange);
				window.addEventListener("pointerover", onOfficialPreview, true);
				window.addEventListener("pointermove", onOfficialPreview, true);
				window.addEventListener("focusin", onOfficialPreview, true);
				window.addEventListener("focusout", onOfficialPreview, true);
				window.addEventListener("scroll", onScroll, true);
				window.addEventListener("resize", onScroll);
			}
			let observer = null;
			if (typeof MutationObserver === "function" && document.documentElement) {
				observer = new MutationObserver((records) => {
					let relevant = false;
					for (const record of records || []) {
						const target = record && record.target;
						if (!target || (state.host && (target === state.host || (state.host.contains && state.host.contains(target))))) continue;
						// Prompt previews are assembled in detached subtrees before the host is mounted.
						// Browser MutationObserver delivery is asynchronous, but the replay harness and some
						// WebView shims can invoke callbacks during appendChild; do not schedule a re-entrant
						// frame for a node that is not connected to the document yet.
						let connected = target === document.documentElement || target === document.body;
						for (let current = target, depth = 0; !connected && current && depth < 64; depth += 1, current = current.parentNode) {
							connected = current === document.documentElement;
						}
						if (!connected) continue;
						relevant = true;
						if (state.source && (target === state.source || (state.source.contains && state.source.contains(target)) || hasPromptRelation(target, state.source))) state.needsRefresh = true;
					}
					if (relevant) schedule();
				});
				observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
					characterData: true,
					attributes: true,
					attributeFilter: [
						"data-chat-flow-kind", "data-chat-flow-key", "data-chat-turn", "data-message-key", "data-session-id",
						"data-attachment", "data-filename", "data-file-name", "data-file-path", "data-mime",
						"title", "alt", "src", "aria-label", "aria-describedby", "aria-current", "role", "hidden", "aria-hidden"
					]
				});
			}
			let resizeObserver = null;
            let resizeTargets = new Set();
			observeLayout = () => {
				if (typeof ResizeObserver !== "function") return;
				const root = conversationScrollRoot();
                const targets = new Set(enabled ? [root, root?.parentElement, state.source, state.host, state.widthTarget].filter(Boolean) : []);
                // Re-observing sends another initial notification in real browsers. Keep the
                // subscriptions stable so a settled resize does not turn into an endless RAF loop.
                if (targets.size === resizeTargets.size && [...targets].every((node) => resizeTargets.has(node))) return;
				if (!resizeObserver) resizeObserver = new ResizeObserver(() => schedule());
				try { resizeObserver.disconnect(); } catch {}
                resizeTargets = targets;
                for (const node of targets) resizeObserver.observe(node, { box: "border-box" });
			};
			observeLayout();
			return () => {
				if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
					window.removeEventListener(HOVER_MESSAGE_ACTIONS_EVENT, onSettingChange);
					window.removeEventListener(ACTIVE_SESSION_EVENT, onSessionChange);
					window.removeEventListener("pointerover", onOfficialPreview, true);
					window.removeEventListener("pointermove", onOfficialPreview, true);
					window.removeEventListener("focusin", onOfficialPreview, true);
					window.removeEventListener("focusout", onOfficialPreview, true);
					window.removeEventListener("scroll", onScroll, true);
					window.removeEventListener("resize", onScroll);
				}
				stopHistoryBinding();
				if (observer) observer.disconnect();
				if (resizeObserver) { try { resizeObserver.disconnect(); } catch {} }
				if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
				removeOverlayHost(state);
				clearComposerCompactMarks(document);
				setHoverMessageActionsAttr(false);
				if (style && style.parentNode && typeof style.parentNode.removeChild === "function") style.parentNode.removeChild(style);
			};
		}
		const CHAT_CONTENT_VISIBILITY_GLOBAL = "__DSH_DESKTOP_CHAT_CONTENT_VISIBILITY__";
		const CHAT_CONTENT_VISIBILITY_EVENT = "dsh-desktop-chat-content-visibility";
		const CHAT_CONTENT_VISIBILITY_ATTR = "data-dsh-desktop-chat-cv";
		const CHAT_CONTENT_VISIBILITY_STYLE_ID = "deepseek-harness-desktop-chat-content-visibility";
		if (typeof window !== "undefined" && typeof window[CHAT_CONTENT_VISIBILITY_GLOBAL] !== "boolean") {
			window[CHAT_CONTENT_VISIBILITY_GLOBAL] = true;
		}
		function publishChatContentVisibility(value) {
			if (typeof value?.chatContentVisibility !== "boolean" || typeof window === "undefined") return;
			const enabled = value.chatContentVisibility;
			window[CHAT_CONTENT_VISIBILITY_GLOBAL] = enabled;
			if (typeof window.dispatchEvent !== "function" || typeof CustomEvent !== "function") return;
			window.dispatchEvent(new CustomEvent(CHAT_CONTENT_VISIBILITY_EVENT, { detail: enabled }));
		}
		function chatContentVisibilityCSS() {
			return "html[" + CHAT_CONTENT_VISIBILITY_ATTR + "] [data-chat-flow-key]{content-visibility:auto;contain-intrinsic-size:auto 80px;}";
		}
		function setChatContentVisibilityAttr(enabled) {
			const root = typeof document === "undefined" ? null : document.documentElement;
			if (!root || typeof root.setAttribute !== "function") return;
			if (enabled) root.setAttribute(CHAT_CONTENT_VISIBILITY_ATTR, "");
			else if (typeof root.removeAttribute === "function") root.removeAttribute(CHAT_CONTENT_VISIBILITY_ATTR);
		}
		function installChatContentVisibility() {
			if (typeof document === "undefined") return () => {};
			let style = typeof document.querySelector === "function"
				? document.querySelector('style[data-plugin-css="' + CHAT_CONTENT_VISIBILITY_STYLE_ID + '"]')
				: null;
			if (!style && typeof document.createElement === "function") {
				style = document.createElement("style");
				style.dataset.plugin = STYLE_ID;
				style.dataset.pluginCss = CHAT_CONTENT_VISIBILITY_STYLE_ID;
				if (document.head && typeof document.head.appendChild === "function") document.head.appendChild(style);
			}
			const writeCSS = () => {
				if (!style) return;
				const css = chatContentVisibilityCSS();
				if (style.textContent !== css) style.textContent = css;
			};
			const applyEnabled = (enabled) => {
				setChatContentVisibilityAttr(enabled !== false);
				writeCSS();
			};
			applyEnabled(typeof window === "undefined" ? true : window[CHAT_CONTENT_VISIBILITY_GLOBAL] !== false);
			const onSettingChange = (event) => applyEnabled(event.detail !== false);
			if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
				window.addEventListener(CHAT_CONTENT_VISIBILITY_EVENT, onSettingChange);
			}
			return () => {
				if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
					window.removeEventListener(CHAT_CONTENT_VISIBILITY_EVENT, onSettingChange);
				}
				setChatContentVisibilityAttr(false);
				if (style && style.parentNode && typeof style.parentNode.removeChild === "function") {
					style.parentNode.removeChild(style);
				}
			};
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
				/* One setting on two lines: the outer row owns the bottom divider only, so the two
				   lines never get a rule between them. */
				.dshDesktopBridgeRowStacked { flex-direction: column !important; align-items: stretch !important; gap: 0 !important; padding: 0 !important; }
				.dshDesktopBridgeRowStacked > .dshDesktopBridgeRow { border-bottom: none !important; padding: 16px 0 0 !important; }
				.dshDesktopBridgeRowStacked > .dshDesktopBridgeRow:last-child { padding-bottom: 16px !important; }
				.dshDesktopBridgeNumber { width: 66px !important; padding: 5px 8px !important; border: .5px solid color-mix(in srgb, var(--dsw-alias-border-l2, rgba(127,127,127,.3)) 92%, transparent) !important; border-radius: 8px !important; background: var(--dsw-alias-bg-layer-2, Canvas) !important; color: var(--dsw-alias-text-primary, inherit) !important; font-size: .82rem !important; font-variant-numeric: tabular-nums !important; text-align: center !important; }
				.dshDesktopBridgeNumber:disabled { opacity: .5 !important; cursor: not-allowed !important; }
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
				.dshDesktopBridgeStatusHeader {
					padding: 8px 0;
					user-select: none;
				}
				.dshDesktopBridgeStatusHeader[aria-expanded="true"] {
					padding: 14px 0 6px;
				}
				.dshDesktopBridgeStatusHeaderLeft {
					display: flex;
					align-items: center;
					gap: 10px;
					min-width: 0;
					flex-wrap: wrap;
				}
				.dshDesktopBridgeStatusHeaderRight {
					display: flex;
					align-items: center;
					gap: 10px;
					flex: none;
				}
				.dshDesktopBridgePill {
					display: inline-flex;
					align-items: center;
					gap: 6px;
					padding: 2px 8px;
					background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04));
					border: .5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
					border-radius: 9999px;
					font-size: 12px;
					font-weight: 500;
					line-height: 18px;
					color: var(--dsw-alias-label-secondary);
					white-space: nowrap;
				}
				.dshDesktopBridgeHeaderAction {
					height: 28px !important;
					padding: 0 12px !important;
					font-size: 13px !important;
					line-height: 26px !important;
				}
				[data-dsh-archived-batch] {
					display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
					min-height: 36px; margin: 2px 0 8px; padding: 6px 8px;
					border: .5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .08));
					border-radius: 8px; background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, .025));
					color: var(--dsw-alias-label-secondary, #5f6368); font-size: 12px;
				}
				[data-dsh-archived-batch] > label {
					display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
					color: var(--dsw-alias-label-primary, #1f2329); white-space: nowrap;
				}
				[data-dsh-archived-batch] input[type="checkbox"] {
					width: 15px; height: 15px; margin: 0; accent-color: var(--dsw-alias-brand-primary, #3370ff);
				}
				[data-dsh-archived-batch-count] { white-space: nowrap; }
				[data-dsh-archived-batch-actions] { display: inline-flex; gap: 6px; margin-left: auto; }
				[data-dsh-archived-batch] button {
					height: 28px; padding: 0 10px; border: .5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
					border-radius: 7px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329);
					font: inherit; font-size: 12px; cursor: pointer;
				}
				[data-dsh-archived-batch] button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .06)); }
				[data-dsh-archived-batch] button:disabled { cursor: default; opacity: .45; }
				[data-dsh-archived-batch-delete] { color: var(--dsw-alias-state-error-primary, #c93c42) !important; }
				[data-dsh-archived-session-select] { flex: none; }
				[data-dsh-archived-batch-progress] {
					position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
					padding: 24px; background: rgba(0, 0, 0, .38);
				}
				[data-dsh-archived-batch-progress-panel] {
					box-sizing: border-box; width: min(460px, 100%); padding: 22px 24px 20px; border-radius: 16px;
					background: var(--dsw-alias-bg-layer-3, #fff); color: var(--dsw-alias-label-primary, #1f2329);
					box-shadow: 0 18px 60px rgba(0, 0, 0, .24);
				}
				[data-dsh-archived-batch-progress-title] { font-size: 16px; font-weight: 650; line-height: 24px; }
				[data-dsh-archived-batch-progress-detail] { margin-top: 10px; color: var(--dsw-alias-label-secondary, #5f6368); font-size: 13px; line-height: 20px; }
				[data-dsh-archived-batch-progress-track] { height: 6px; margin-top: 16px; overflow: hidden; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .08)); }
				[data-dsh-archived-batch-progress-bar] { width: 0; height: 100%; border-radius: inherit; background: var(--dsw-alias-brand-primary, #3370ff); transition: width .18s ease; }
				[data-dsh-archived-batch-progress-result] { margin-top: 12px; color: var(--dsw-alias-label-secondary, #5f6368); font-size: 13px; line-height: 20px; white-space: pre-wrap; }
				[data-dsh-archived-batch-progress-close] { display: none; min-width: 72px; height: 34px; margin-top: 18px; padding: 0 14px; border: 0; border-radius: 9px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .06)); color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 13px; cursor: pointer; }
				[data-dsh-archived-batch-progress][data-dsh-archived-batch-progress-done] [data-dsh-archived-batch-progress-close] { display: block; margin-left: auto; }
				[data-dsh-batch-confirm-neutral] { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .06)) !important; color: var(--dsw-alias-label-primary, #1f2329) !important; }
				[data-dsh-delete-session-confirm] {
					position: fixed; inset: 0; z-index: 2147483647;
					display: flex; align-items: center; justify-content: center;
					padding: 24px; background: rgba(0, 0, 0, .38);
				}
				[data-dsh-delete-session-confirm-panel] {
					box-sizing: border-box; width: min(420px, 100%);
					padding: 22px 24px 20px; border-radius: 16px;
					background: var(--dsw-alias-bg-layer-3, #fff);
					color: var(--dsw-alias-label-primary, #1f2329);
					box-shadow: 0 18px 60px rgba(0, 0, 0, .24);
				}
				[data-dsh-delete-session-confirm-title] {
					font-size: 16px; font-weight: 650; line-height: 24px;
				}
				[data-dsh-delete-session-confirm-message] {
					margin-top: 10px; color: var(--dsw-alias-label-secondary, #5f6368);
					font-size: 13px; line-height: 20px;
				}
				[data-dsh-delete-session-confirm-actions] {
					display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
				}
				[data-dsh-delete-session-confirm-actions] button {
					min-width: 72px; height: 34px; padding: 0 14px; border-radius: 9px;
					border: 0; font: inherit; font-size: 13px; cursor: pointer;
				}
				[data-dsh-delete-session-confirm-cancel] {
					background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, .06));
					color: var(--dsw-alias-label-primary, #1f2329);
				}
				[data-dsh-delete-session-confirm-submit] {
					background: var(--dsw-alias-state-error-primary, #c93c42); color: #fff;
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
		// The nav row is located by text, so accept the localized label and the English
		// fallback: the section may have been registered before the catalog loaded.
		const DESKTOP_NAV_LABEL = "Desktop settings";
		const desktopNavLabels = () => {
			const localized = t("tray.open_settings");
			return localized === DESKTOP_NAV_LABEL ? [localized] : [localized, DESKTOP_NAV_LABEL];
		};
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
				const accepted = desktopNavLabels();
				for (const el of labels) {
					if (!accepted.includes((el.textContent || "").trim())) continue;
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
			const obs = new MutationObserver((records) => {
				// The prompt mirror is mounted under body and can create many child nodes while it
				// paints. None of those mutations can change the desktop settings row, and ignoring them
				// avoids needless repaint/replacement churn (especially in synchronous WebView shims).
				const isConnected = (node) => {
					if (!node) return false;
					if (node === document.documentElement || node === document.body) return true;
					let current = node;
					for (let depth = 0; current && depth < 64; depth += 1, current = current.parentNode) {
						if (current === document.documentElement) return true;
					}
					return false;
				};
				const relevant = (records || []).some((record) => {
					const target = record?.target;
					// Detached prompt-preview subtrees are assembled before they are mounted. Real
					// MutationObserver delivery sees them after mounting, while synchronous replay shims
					// can deliver each append immediately; neither should repaint the nav row.
					if (!isConnected(target) || target === document.body) return false;
					return !(target.hasAttribute?.(PROMPT_OVERLAY_ATTR) || target.closest?.("[" + PROMPT_OVERLAY_ATTR + "]"));
				});
				if (relevant) paint();
			});
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
			en: Object.freeze({ rename: "Rename", fork: "Fork session", archive: "Archive session", copy: "Copy session ID", copied: "Copied", copyFailed: "Copy failed" }),
			de: Object.freeze({ rename: "Umbenennen", fork: "Sitzung forken", archive: "Sitzung archivieren", copy: "Sitzungs-ID kopieren", copied: "Kopiert", copyFailed: "Kopieren fehlgeschlagen" }),
			fr: Object.freeze({ rename: "Renommer", fork: "Dupliquer la session", archive: "Archiver la session", copy: "Copier l’identifiant de session", copied: "Copié", copyFailed: "Échec de la copie" }),
			es: Object.freeze({ rename: "Renombrar", fork: "Bifurcar sesión", archive: "Archivar sesión", copy: "Copiar ID de sesión", copied: "Copiado", copyFailed: "Error al copiar" }),
			ja: Object.freeze({ rename: "名前を変更", fork: "セッションを分岐", archive: "セッションをアーカイブ", copy: "セッションIDをコピー", copied: "コピーしました", copyFailed: "コピーに失敗しました" }),
			ko: Object.freeze({ rename: "이름 바꾸기", fork: "세션 분기", archive: "세션 보관", copy: "세션 ID 복사", copied: "복사됨", copyFailed: "복사하지 못했습니다" }),
			pt: Object.freeze({ rename: "Renomear", fork: "Bifurcar sessão", archive: "Arquivar sessão", copy: "Copiar ID da sessão", copied: "Copiado", copyFailed: "Falha ao copiar" })
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



		const DELETE_SESSION_MENU_ATTRIBUTE = "data-dsh-delete-session";
		const DELETE_SESSION_MENU_WRAPPER_ATTRIBUTE = "data-dsh-delete-session-wrapper";
		const DELETE_SESSION_MENU_COMPLETED_ATTRIBUTE = "data-dsh-delete-session-completed";
		const DELETE_SESSION_MENU_VALUE_ATTRIBUTE = "data-dsh-delete-session-value";
		const DELETE_SESSION_MENU_LABEL_ATTRIBUTE = "data-dsh-delete-session-label";
		const DELETE_SESSION_MENU_LABELS = Object.freeze({ zh: "删除会话", en: "Delete session", de: "Sitzung löschen", fr: "Supprimer la session", es: "Eliminar sesión", ja: "セッションを削除", ko: "세션 삭제", pt: "Excluir sessão" });
		const DELETE_SESSION_CONFIRM_ATTRIBUTE = "data-dsh-delete-session-confirm";
		const DELETE_SESSION_CONFIRM_PANEL_ATTRIBUTE = "data-dsh-delete-session-confirm-panel";
		const DELETE_SESSION_CONFIRM_TITLE_ATTRIBUTE = "data-dsh-delete-session-confirm-title";
		const DELETE_SESSION_CONFIRM_MESSAGE_ATTRIBUTE = "data-dsh-delete-session-confirm-message";
		const DELETE_SESSION_CONFIRM_ACTIONS_ATTRIBUTE = "data-dsh-delete-session-confirm-actions";
		const DELETE_SESSION_CONFIRM_CANCEL_ATTRIBUTE = "data-dsh-delete-session-confirm-cancel";
		const DELETE_SESSION_CONFIRM_SUBMIT_ATTRIBUTE = "data-dsh-delete-session-confirm-submit";
		let deleteSessionConfirmCloser = null;
		function closeDeleteSessionConfirmation() {
			const close = deleteSessionConfirmCloser;
			if (typeof close === "function") close();
		}
		function requestDeleteSessionConfirmation(message, options = {}) {
			if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.documentElement) return Promise.resolve(false);
			closeDeleteSessionConfirmation();
			return new Promise((resolve) => {
				const host = document.body || document.documentElement;
				const backdrop = document.createElement("div");
				backdrop.setAttribute(DELETE_SESSION_CONFIRM_ATTRIBUTE, "");
				backdrop.setAttribute("role", "presentation");
				const panel = document.createElement("div");
				panel.setAttribute(DELETE_SESSION_CONFIRM_PANEL_ATTRIBUTE, "");
				panel.setAttribute("role", "dialog");
				panel.setAttribute("aria-modal", "true");
				const title = document.createElement("div");
				title.setAttribute(DELETE_SESSION_CONFIRM_TITLE_ATTRIBUTE, "");
				title.textContent = options.title || t("bridge.session_delete_title");
				const body = document.createElement("div");
				body.setAttribute(DELETE_SESSION_CONFIRM_MESSAGE_ATTRIBUTE, "");
				body.textContent = message;
				const actions = document.createElement("div");
				actions.setAttribute(DELETE_SESSION_CONFIRM_ACTIONS_ATTRIBUTE, "");
				const cancel = document.createElement("button");
				cancel.setAttribute("type", "button");
				cancel.setAttribute(DELETE_SESSION_CONFIRM_CANCEL_ATTRIBUTE, "");
				cancel.textContent = options.cancel || t("bridge.session_delete_cancel");
				const submit = document.createElement("button");
				submit.setAttribute("type", "button");
				submit.setAttribute(DELETE_SESSION_CONFIRM_SUBMIT_ATTRIBUTE, "");
				if (options.danger === false) submit.setAttribute("data-dsh-batch-confirm-neutral", "");
				submit.textContent = options.action || t("bridge.session_delete_action");
				let settled = false;
				const finish = (accepted) => {
					if (settled) return;
					settled = true;
					if (typeof window !== "undefined" && typeof window.removeEventListener === "function") window.removeEventListener("keydown", onKeydown);
					if (deleteSessionConfirmCloser === close) deleteSessionConfirmCloser = null;
					if (backdrop.parentElement) backdrop.remove();
					resolve(accepted);
				};
				const close = () => finish(false);
				const onKeydown = (event) => { if (event.key === "Escape") finish(false); };
				deleteSessionConfirmCloser = close;
				cancel.addEventListener("click", () => finish(false));
				submit.addEventListener("click", () => finish(true));
				backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); });
				if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("keydown", onKeydown);
				actions.appendChild(cancel); actions.appendChild(submit);
				panel.appendChild(title); panel.appendChild(body); panel.appendChild(actions);
				backdrop.appendChild(panel); host.appendChild(backdrop);
				if (typeof submit.focus === "function") submit.focus();
			});
		}

		// Match the official IconTrashOutline16 geometry so the injected delete item
		// matches the exact visual weight, proportions, and curves of Rename/Fork/Copy/Archive.
		function deleteSessionIconSVG() {
			if (typeof document === "undefined" || typeof document.createElementNS !== "function") return null;
			const ns = "http://www.w3.org/2000/svg";
			const svg = document.createElementNS(ns, "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			const path = document.createElementNS(ns, "path");
			path.setAttribute("d", "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z");
			path.setAttribute("fill", "currentColor");
			svg.appendChild(path);
			return svg;
		}
		function removeDeleteSessionMenuItem(item) { if (!item) return; const wrapper = item.parentElement?.hasAttribute(DELETE_SESSION_MENU_WRAPPER_ATTRIBUTE) ? item.parentElement : item; wrapper.remove(); }
		async function deleteSessionFromMenu(item, ctx) {
			const sessionId = item.getAttribute(DELETE_SESSION_MENU_VALUE_ATTRIBUTE) || "";
			if (!sessionId || !(await requestDeleteSessionConfirmation(t("bridge.session_delete_confirm")))) return;
			item.setAttribute("aria-disabled", "true");
			try {
				const result = await callDesktopRPC(ctx.connection, "deleteSession", { sessionId }, undefined);
				if (!result?.ok) { const error = new Error(result?.error?.message || t("bridge.session_delete_failed", "")); error.code = result?.error?.code || "desktop-bridge/delete-failed"; throw error; }
				const uiWorkspace = typeof ctx?.get === "function" ? ctx.get("uiWorkspace") : ctx?.uiWorkspace;
				if (typeof uiWorkspace?.startSession === "function") await uiWorkspace.startSession();
				const menu = item.closest?.("[role=\"menu\"]");
				if (menu) menu.setAttribute(DELETE_SESSION_MENU_COMPLETED_ATTRIBUTE, "");
				removeDeleteSessionMenuItem(item);
			} catch (error) {
				const message = t("bridge.session_delete_failed", desktopErrorMessage(error));
				if (typeof window.alert === "function") window.alert(message); else if (typeof console !== "undefined" && typeof console.error === "function") console.error(message, error);
				item.removeAttribute("aria-disabled");
			}
		}
		function makeDeleteSessionMenuItem(template, sessionId, locale, ctx) {
			const labelText = DELETE_SESSION_MENU_LABELS[locale] || DELETE_SESSION_MENU_LABELS.en;
			const item = template.cloneNode(true); item.removeAttribute("disabled"); item.removeAttribute("aria-haspopup"); item.removeAttribute("aria-expanded");
			item.setAttribute(DELETE_SESSION_MENU_ATTRIBUTE, ""); item.setAttribute(DELETE_SESSION_MENU_VALUE_ATTRIBUTE, sessionId); item.setAttribute("aria-label", labelText);
			const spans = item.querySelectorAll("span"); const label = spans.length > 0 ? spans[spans.length - 1] : document.createElement("span"); if (spans.length === 0) item.appendChild(label); label.setAttribute(DELETE_SESSION_MENU_LABEL_ATTRIBUTE, ""); label.textContent = labelText;
			if (spans.length > 1) { spans[0].textContent = ""; spans[0].setAttribute("aria-hidden", "true"); const icon = deleteSessionIconSVG(); if (icon) spans[0].appendChild(icon); }
			item.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void deleteSessionFromMenu(item, ctx); }); return item;
		}
		function installDeleteSessionMenu(ctx) {
			if (typeof document === "undefined" || typeof document.addEventListener !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function" || !document.documentElement || typeof MutationObserver !== "function") return () => {};
			let enabled = window[DELETE_SESSION_ACTIONS_GLOBAL] !== false; let pendingSessionId = ""; let pendingAt = 0; let scheduled = false;
			const rememberSessionAction = (event) => { const button = event.target?.closest?.("button"); if (!button || button.closest("[role='menu']")) return; const row = button.closest("[role='treeitem']"); if (!row) return; const id = sessionIdFromElement(button) || sessionIdFromElement(row); if (id) { pendingSessionId = id; pendingAt = Date.now(); } };
			const decorate = () => {
				const injected = document.querySelectorAll("[" + DELETE_SESSION_MENU_ATTRIBUTE + "]"); if (!enabled) { for (const item of injected) removeDeleteSessionMenuItem(item); return; }
				for (const menu of document.querySelectorAll("[role='menu']")) {
					if (menu.hasAttribute(DELETE_SESSION_MENU_COMPLETED_ATTRIBUTE) || menu.querySelector("[" + DELETE_SESSION_MENU_ATTRIBUTE + "]")) continue; const locale = sessionMenuLocale(menu); if (!locale) continue;
					const fresh = pendingSessionId && Date.now() - pendingAt < PENDING_SESSION_ID_TTL_MS; const sessionId = sessionIdFromElement(menu) || (fresh ? pendingSessionId : ""); if (!sessionId) continue;
					const menuItems = [...menu.querySelectorAll("button[role='menuitem']")]; const archive = menuItems.find((entry) => (entry.textContent || "").replace(/\s+/g, " ").trim() === SESSION_MENU_LABELS[locale].archive); const template = archive || menuItems[menuItems.length - 1]; if (!template) continue;
					const item = makeDeleteSessionMenuItem(template, sessionId, locale, ctx); const templateWrapper = template.parentElement; const wrapper = templateWrapper?.cloneNode(false);
					if (wrapper) { wrapper.setAttribute(DELETE_SESSION_MENU_WRAPPER_ATTRIBUTE, ""); wrapper.appendChild(item); if (templateWrapper?.parentElement) templateWrapper.parentElement.appendChild(wrapper); } else menu.appendChild(item);
					pendingSessionId = ""; pendingAt = 0;
				}
			};
			const schedule = () => { if (scheduled) return; scheduled = true; const run = () => { scheduled = false; decorate(); }; if (typeof queueMicrotask === "function") queueMicrotask(run); else if (typeof window.setTimeout === "function") window.setTimeout(run, 0); else setTimeout(run, 0); };
			const onSettingChange = (event) => { enabled = event.detail !== false; schedule(); };
			document.addEventListener("pointerdown", rememberSessionAction, true); document.addEventListener("click", rememberSessionAction, true); window.addEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange);
			const observer = new MutationObserver(schedule); observer.observe(document.documentElement, { childList: true, subtree: true }); schedule();
			return () => { document.removeEventListener("pointerdown", rememberSessionAction, true); document.removeEventListener("click", rememberSessionAction, true); window.removeEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange); observer.disconnect(); closeDeleteSessionConfirmation(); for (const menu of document.querySelectorAll("[role='menu']")) menu.removeAttribute(DELETE_SESSION_MENU_COMPLETED_ATTRIBUTE); for (const item of document.querySelectorAll("[" + DELETE_SESSION_MENU_ATTRIBUTE + "]")) removeDeleteSessionMenuItem(item); };
		}
		const ARCHIVED_DELETE_SESSION_ATTRIBUTE = "data-dsh-delete-archived-session";
		function likelySessionId(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(value) && !/^(row|item|archived|session|undefined|null)$/i.test(value); }
		function archivedSessionIdFromElement(element) {
			const candidates = []; for (const name of ["data-session-id", "data-id"]) { const value = element?.getAttribute?.(name); if (value) candidates.push(value); }
			try { for (let current = reactFiberFromElement(element), depth = 0; current && depth < 80; current = current.return, depth += 1) { const props = current.memoizedProps || current.pendingProps; for (const value of [props?.id, props?.sessionId, props?.session?.id, props?.item?.id, props?.row?.id, props?.entity?.id, current.key]) if (value != null) candidates.push(String(value)); } } catch (_) { /* fail closed below */ }
			return candidates.find(likelySessionId) || "";
		}
		function archivedUnarchiveButton(row) { const labels = ["unarchive", "取消归档", "désarchiv", "desarchiv", "archivierung rückgängig", "アーカイブ解除", "보관 취소", "desarquiv"]; return [...row.querySelectorAll("button")].find((button) => { const text = ((button.getAttribute("aria-label") || "") + " " + (button.textContent || "")).toLowerCase(); return labels.some((label) => text.includes(label.toLowerCase())); }); }
		async function deleteArchivedSession(button, row, ctx) {
			const sessionId = button.getAttribute("data-dsh-delete-archived-id") || "";
			if (!sessionId || !(await requestDeleteSessionConfirmation(t("bridge.session_delete_confirm")))) return;
			button.setAttribute("aria-disabled", "true");
			try { const result = await callDesktopRPC(ctx.connection, "deleteSession", { sessionId }, undefined); if (!result?.ok) { const error = new Error(result?.error?.message || t("bridge.session_delete_failed", "")); error.code = result?.error?.code || "desktop-bridge/delete-failed"; throw error; } const uiWorkspace = typeof ctx?.get === "function" ? ctx.get("uiWorkspace") : ctx?.uiWorkspace; if (typeof uiWorkspace?.startSession === "function") await uiWorkspace.startSession(); row.remove(); } catch (error) { const message = t("bridge.session_delete_failed", desktopErrorMessage(error)); if (typeof window.alert === "function") window.alert(message); else if (typeof console !== "undefined" && typeof console.error === "function") console.error(message, error); button.removeAttribute("aria-disabled"); }
		}
		function makeArchivedDeleteButton(template, sessionId, row, ctx) { const button = template.cloneNode(true); button.removeAttribute("disabled"); button.setAttribute(ARCHIVED_DELETE_SESSION_ATTRIBUTE, ""); button.setAttribute("data-dsh-delete-archived-id", sessionId); const deleteLocale = localeCode === "zh-CN" ? "zh" : (DELETE_SESSION_MENU_LABELS[localeCode] ? localeCode : "en"); const deleteLabel = DELETE_SESSION_MENU_LABELS[deleteLocale] || DELETE_SESSION_MENU_LABELS.en; button.setAttribute("aria-label", deleteLabel); button.textContent = deleteLabel; button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void deleteArchivedSession(button, row, ctx); }); return button; }
		function installArchivedSessionDelete(ctx) {
			if (typeof document === "undefined" || typeof document.addEventListener !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function" || !document.documentElement || typeof MutationObserver !== "function") return () => {};
			let enabled = window[DELETE_SESSION_ACTIONS_GLOBAL] !== false; let scheduled = false;
			const decorate = () => { const injected = document.querySelectorAll("[" + ARCHIVED_DELETE_SESSION_ATTRIBUTE + "]"); if (!enabled) { for (const button of injected) button.remove(); return; } for (const row of document.querySelectorAll("li")) { if (row.querySelector("[" + ARCHIVED_DELETE_SESSION_ATTRIBUTE + "]")) continue; const unarchive = archivedUnarchiveButton(row); if (!unarchive) continue; const sessionId = archivedSessionIdFromElement(row); if (!sessionId) continue; const button = makeArchivedDeleteButton(unarchive, sessionId, row, ctx); (unarchive.parentElement || row).appendChild(button); } };
			const schedule = () => { if (scheduled) return; scheduled = true; const run = () => { scheduled = false; decorate(); }; if (typeof queueMicrotask === "function") queueMicrotask(run); else if (typeof window.setTimeout === "function") window.setTimeout(run, 0); else setTimeout(run, 0); };
			const onSettingChange = (event) => { enabled = event.detail !== false; schedule(); }; window.addEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange); const observer = new MutationObserver(schedule); observer.observe(document.documentElement, { childList: true, subtree: true }); schedule();
			return () => { window.removeEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange); observer.disconnect(); closeDeleteSessionConfirmation(); for (const button of document.querySelectorAll("[" + ARCHIVED_DELETE_SESSION_ATTRIBUTE + "]")) button.remove(); };
		}

		const ARCHIVED_BATCH_ATTRIBUTE = "data-dsh-archived-batch";
		const ARCHIVED_BATCH_SELECT_ALL_ATTRIBUTE = "data-dsh-archived-batch-select-all";
		const ARCHIVED_BATCH_COUNT_ATTRIBUTE = "data-dsh-archived-batch-count";
		const ARCHIVED_BATCH_UNARCHIVE_ATTRIBUTE = "data-dsh-archived-batch-unarchive";
		const ARCHIVED_BATCH_DELETE_ATTRIBUTE = "data-dsh-archived-batch-delete";
		const ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE = "data-dsh-archived-session-select";
		const ARCHIVED_BATCH_ROW_SELECT_ID_ATTRIBUTE = "data-dsh-archived-session-select-id";
		const ARCHIVED_BATCH_PROGRESS_ATTRIBUTE = "data-dsh-archived-batch-progress";
		const ARCHIVED_BATCH_PROGRESS_PANEL_ATTRIBUTE = "data-dsh-archived-batch-progress-panel";
		const ARCHIVED_BATCH_PROGRESS_TITLE_ATTRIBUTE = "data-dsh-archived-batch-progress-title";
		const ARCHIVED_BATCH_PROGRESS_DETAIL_ATTRIBUTE = "data-dsh-archived-batch-progress-detail";
		const ARCHIVED_BATCH_PROGRESS_TRACK_ATTRIBUTE = "data-dsh-archived-batch-progress-track";
		const ARCHIVED_BATCH_PROGRESS_BAR_ATTRIBUTE = "data-dsh-archived-batch-progress-bar";
		const ARCHIVED_BATCH_PROGRESS_RESULT_ATTRIBUTE = "data-dsh-archived-batch-progress-result";
		const ARCHIVED_BATCH_PROGRESS_CLOSE_ATTRIBUTE = "data-dsh-archived-batch-progress-close";
		const ARCHIVED_BATCH_PROGRESS_DONE_ATTRIBUTE = "data-dsh-archived-batch-progress-done";

		function archivedBatchRows() {
			const rows = [];
			for (const row of document.querySelectorAll("li")) {
				if (!archivedUnarchiveButton(row)) continue;
				const id = archivedSessionIdFromElement(row);
				if (!id) continue;
				rows.push({ row, id });
			}
			return rows;
		}
		function archivedBatchList() {
			for (const list of document.querySelectorAll("ul")) {
				if (archivedBatchRows().some((entry) => entry.row.parentElement === list)) return list;
			}
			return null;
		}
		function archivedBatchTitle(row, id) {
			const spans = row?.querySelectorAll?.("span") || [];
			const text = spans[0]?.textContent || row?.textContent || id;
			return String(text || id).replace(/\s+/g, " ").trim().slice(0, 120) || id;
		}
		function archivedBatchProgress(kind, total) {
			const host = document.body || document.documentElement;
			const backdrop = document.createElement("div");
			backdrop.setAttribute(ARCHIVED_BATCH_PROGRESS_ATTRIBUTE, "");
			backdrop.setAttribute("role", "presentation");
			const panel = document.createElement("div");
			panel.setAttribute(ARCHIVED_BATCH_PROGRESS_PANEL_ATTRIBUTE, "");
			panel.setAttribute("role", "status");
			panel.setAttribute("aria-live", "polite");
			const title = document.createElement("div");
			title.setAttribute(ARCHIVED_BATCH_PROGRESS_TITLE_ATTRIBUTE, "");
			title.textContent = t("bridge.archived_batch_progress_title");
			const detail = document.createElement("div");
			detail.setAttribute(ARCHIVED_BATCH_PROGRESS_DETAIL_ATTRIBUTE, "");
			const track = document.createElement("div");
			track.setAttribute(ARCHIVED_BATCH_PROGRESS_TRACK_ATTRIBUTE, "");
			const bar = document.createElement("div");
			bar.setAttribute(ARCHIVED_BATCH_PROGRESS_BAR_ATTRIBUTE, "");
			track.appendChild(bar);
			const result = document.createElement("div");
			result.setAttribute(ARCHIVED_BATCH_PROGRESS_RESULT_ATTRIBUTE, "");
			const close = document.createElement("button");
			close.setAttribute("type", "button");
			close.setAttribute(ARCHIVED_BATCH_PROGRESS_CLOSE_ATTRIBUTE, "");
			close.textContent = t("bridge.archived_batch_close");
			let closed = false;
			const closePanel = () => {
				if (closed) return;
				closed = true;
				if (backdrop.parentElement) backdrop.remove();
			};
			close.addEventListener("click", closePanel);
			panel.appendChild(title);
			panel.appendChild(detail);
			panel.appendChild(track);
			panel.appendChild(result);
			panel.appendChild(close);
			backdrop.appendChild(panel);
			host.appendChild(backdrop);
			const update = (index, sessionTitle) => {
				const safeIndex = Math.max(0, Math.min(total, index));
				const percent = total > 0 ? Math.round((safeIndex / total) * 100) : 0;
				detail.textContent = safeIndex > 0
					? t("bridge.archived_batch_progress", safeIndex, total, sessionTitle || "")
					: t("bridge.archived_batch_progress", 0, total, "");
				bar.style.width = percent + "%";
				backdrop.setAttribute("aria-valuenow", String(percent));
			};
			const finish = (completed, failed) => {
				backdrop.setAttribute(ARCHIVED_BATCH_PROGRESS_DONE_ATTRIBUTE, "");
				bar.style.width = "100%";
				result.textContent = failed.length === 0
					? t("bridge.archived_batch_done", completed, total)
					: t("bridge.archived_batch_partial", completed, total, failed.length) + "\n" + failed.map((item) => item.title + ": " + desktopErrorMessage(item.error)).join("\n");
				close.focus?.();
			};
			update(0, "");
			return { update, finish, close: closePanel };
		}
		function installArchivedSessionBatch(ctx) {
			if (typeof document === "undefined" || typeof document.addEventListener !== "function" || typeof window === "undefined" || typeof window.addEventListener !== "function" || !document.documentElement || typeof MutationObserver !== "function") return () => {};
			const selected = new Set();
			let knownOrder = [];
			let scheduled = false;
			let busy = false;
			let deleteEnabled = window[DELETE_SESSION_ACTIONS_GLOBAL] !== false;
			let activeProgress = null;
			const selectedInListOrder = () => {
				const rank = new Map(knownOrder.map((id, index) => [id, index]));
				return [...selected].sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
			};
			const updateToolbar = (toolbar, rows) => {
				if (!toolbar) return;
				const visibleIds = rows.map((entry) => entry.id);
				const selectedCount = selected.size;
				const selectAll = toolbar.querySelector("[" + ARCHIVED_BATCH_SELECT_ALL_ATTRIBUTE + "]");
				const count = toolbar.querySelector("[" + ARCHIVED_BATCH_COUNT_ATTRIBUTE + "]");
				const unarchive = toolbar.querySelector("[" + ARCHIVED_BATCH_UNARCHIVE_ATTRIBUTE + "]");
				const deleteButton = toolbar.querySelector("[" + ARCHIVED_BATCH_DELETE_ATTRIBUTE + "]");
				const selectedVisible = visibleIds.filter((id) => selected.has(id)).length;
				if (selectAll) {
					selectAll.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
					selectAll.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
					selectAll.disabled = busy || visibleIds.length === 0;
				}
				if (count) {
					const selectedLabel = t("bridge.archived_batch_selected", selectedCount);
					if (count.textContent !== selectedLabel) count.textContent = selectedLabel;
				}
				if (unarchive) unarchive.disabled = busy || selectedCount === 0;
				if (deleteButton) {
					deleteButton.disabled = busy || selectedCount === 0;
					deleteButton.style.display = deleteEnabled ? "" : "none";
				}
				for (const entry of rows) {
					const checkbox = entry.row.querySelector("[" + ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE + "]");
					if (checkbox) {
						checkbox.checked = selected.has(entry.id);
						checkbox.disabled = busy;
					}
				}
			};
			const createToolbar = () => {
				const toolbar = document.createElement("div");
				toolbar.setAttribute(ARCHIVED_BATCH_ATTRIBUTE, "");
				const label = document.createElement("label");
				const selectAll = document.createElement("input");
				selectAll.type = "checkbox";
				selectAll.setAttribute(ARCHIVED_BATCH_SELECT_ALL_ATTRIBUTE, "");
				selectAll.setAttribute("aria-label", t("bridge.archived_batch_select_all"));
				const labelText = document.createElement("span");
				labelText.textContent = t("bridge.archived_batch_select_all");
				label.appendChild(selectAll);
				label.appendChild(labelText);
				const count = document.createElement("span");
				count.setAttribute(ARCHIVED_BATCH_COUNT_ATTRIBUTE, "");
				const actions = document.createElement("div");
				actions.setAttribute("data-dsh-archived-batch-actions", "");
				const unarchive = document.createElement("button");
				unarchive.type = "button";
				unarchive.setAttribute(ARCHIVED_BATCH_UNARCHIVE_ATTRIBUTE, "");
				unarchive.textContent = t("bridge.archived_batch_unarchive");
				const deleteButton = document.createElement("button");
				deleteButton.type = "button";
				deleteButton.setAttribute(ARCHIVED_BATCH_DELETE_ATTRIBUTE, "");
				deleteButton.textContent = t("bridge.archived_batch_delete");
				actions.appendChild(unarchive);
				actions.appendChild(deleteButton);
				toolbar.appendChild(label);
				toolbar.appendChild(count);
				toolbar.appendChild(actions);
				selectAll.addEventListener("change", () => {
					if (busy) return;
					for (const entry of archivedBatchRows()) {
						if (selectAll.checked) selected.add(entry.id);
						else selected.delete(entry.id);
					}
					decorate();
				});
				unarchive.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void confirmAndRun("unarchive"); });
				deleteButton.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void confirmAndRun("delete"); });
				return toolbar;
			};
			const rowCheckbox = (entry) => {
				const checkbox = document.createElement("input");
				checkbox.type = "checkbox";
				checkbox.setAttribute(ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE, "");
				checkbox.setAttribute(ARCHIVED_BATCH_ROW_SELECT_ID_ATTRIBUTE, entry.id);
				checkbox.setAttribute("aria-label", entry.id);
				checkbox.checked = selected.has(entry.id);
				checkbox.addEventListener("click", (event) => { event.stopPropagation(); });
				checkbox.addEventListener("change", (event) => {
					if (busy) return;
					if (event.target.checked) selected.add(entry.id);
					else selected.delete(entry.id);
					decorate();
				});
				return checkbox;
			};
			const decorate = () => {
				const list = archivedBatchList();
				if (!list) {
					for (const toolbar of document.querySelectorAll("[" + ARCHIVED_BATCH_ATTRIBUTE + "]")) toolbar.remove();
					for (const checkbox of document.querySelectorAll("[" + ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE + "]")) checkbox.remove();
					return;
				}
				const rows = archivedBatchRows().filter((entry) => entry.row.parentElement === list);
				knownOrder = rows.map((entry) => entry.id);
				let toolbar = document.querySelector("[" + ARCHIVED_BATCH_ATTRIBUTE + "]");
				if (!toolbar) toolbar = createToolbar();
				if (toolbar.parentElement !== list.parentElement) list.before(toolbar);
				for (const entry of rows) {
					if (entry.row.querySelector("[" + ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE + "]")) continue;
					const first = entry.row.childNodes[0];
					const checkbox = rowCheckbox(entry);
					if (first) first.before(checkbox);
					else entry.row.appendChild(checkbox);
				}
				updateToolbar(toolbar, rows);
			};
			const schedule = () => {
				if (scheduled) return;
				scheduled = true;
				const run = () => { decorate(); scheduled = false; };
				if (typeof queueMicrotask === "function") queueMicrotask(run);
				else if (typeof window.setTimeout === "function") window.setTimeout(run, 0);
				else setTimeout(run, 0);
			};
			const rowById = (id) => archivedBatchRows().find((entry) => entry.id === id)?.row;
			const confirmAndRun = async (kind) => {
				if (busy) return;
				const ids = selectedInListOrder();
				if (ids.length === 0) return;
				const deleting = kind === "delete";
				const confirmed = await requestDeleteSessionConfirmation(
					deleting ? t("bridge.archived_batch_delete_confirm", ids.length) : t("bridge.archived_batch_unarchive_confirm", ids.length),
					{
						title: deleting ? t("bridge.archived_batch_delete_title") : t("bridge.archived_batch_unarchive_title"),
						action: deleting ? t("bridge.archived_batch_delete") : t("bridge.archived_batch_unarchive"),
						danger: deleting
					}
				);
				if (!confirmed) return;
				busy = true;
				const progress = archivedBatchProgress(kind, ids.length);
				activeProgress = progress;
				const failed = [];
				let completed = 0;
				for (const [index, id] of ids.entries()) {
					const row = rowById(id);
					const title = archivedBatchTitle(row, id);
					progress.update(index, title);
					try {
						if (deleting) {
							const result = await callDesktopRPC(ctx.connection, "deleteSession", { sessionId: id }, undefined);
							if (!result?.ok) {
								const error = new Error(result?.error?.message || t("bridge.session_delete_failed", ""));
								error.code = result?.error?.code || "desktop-bridge/delete-failed";
								throw error;
							}
						} else {
							const uiWorkspace = typeof ctx?.get === "function" ? ctx.get("uiWorkspace") : ctx?.uiWorkspace;
							if (typeof uiWorkspace?.unarchiveSession !== "function") throw new Error("unarchive unavailable");
							await uiWorkspace.unarchiveSession(id);
						}
						completed += 1;
						selected.delete(id);
						if (row?.parentElement) row.remove();
					} catch (error) {
						failed.push({ id, title, error });
					}
					progress.update(index + 1, title);
					decorate();
				}
				busy = false;
				activeProgress = null;
				progress.finish(completed, failed);
				schedule();
			};
			const onSettingChange = (event) => { deleteEnabled = event.detail !== false; schedule(); };
			window.addEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange);
			const observer = new MutationObserver(schedule);
			observer.observe(document.documentElement, { childList: true, subtree: true });
			schedule();
			return () => {
				window.removeEventListener(DELETE_SESSION_ACTIONS_EVENT, onSettingChange);
				observer.disconnect();
				activeProgress?.close();
				for (const toolbar of document.querySelectorAll("[" + ARCHIVED_BATCH_ATTRIBUTE + "]")) toolbar.remove();
				for (const checkbox of document.querySelectorAll("[" + ARCHIVED_BATCH_ROW_SELECT_ATTRIBUTE + "]")) checkbox.remove();
				selected.clear();
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
			const [statusOpen, setStatusOpen] = react.useState(false);
			const [recordingShortcutId, setRecordingShortcutId] = react.useState(null);
			const [transport, setTransport] = react.useState(typeof window !== "undefined" ? window[TRANSPORT_STATE_GLOBAL] : undefined);
			const backoffRef = react.useRef(1000);
			const timerRef = react.useRef(null);
			const linkRef = react.useRef(link);
			const draftSeededRef = react.useRef(false);
			const draftDirtyRef = react.useRef(false);
			linkRef.current = link;

			const call = react.useCallback(async (endpoint, payload, signal) => {
				const result = await callDesktopRPC(connection, endpoint, payload, signal);
				if (!result.ok) {
					const err = new Error(desktopErrorMessage(result.error));
					err.code = result.error?.code;
					throw err;
				}
				return result.value;
			}, [connection]);

			const refresh = react.useCallback(async (signal, opts = {}) => {
				const syncDraft = opts.syncDraft === true || (!draftSeededRef.current && !draftDirtyRef.current);
				const clearMessage = opts.clearMessage === true;
				try {
					await ensureDesktopHandshake(connection);
					setTransport(typeof window !== "undefined" ? window[TRANSPORT_STATE_GLOBAL] : undefined);
					const [nextStatus, nextPrefs, nextUpdate, versionPayload] = await Promise.all([
						call("status", {}, signal),
						call("prefs", {}, signal),
						call("updateStatus", {}, signal),
						call("appVersion", {}, signal)
					]);
					setStatus(nextStatus);
					setPrefs(nextPrefs);
					publishShowCopySessionId(nextPrefs);
					publishDeleteSessionActions(nextPrefs);
					publishHoverMessageActions(nextPrefs);
					publishPromptOverlayLanguage(nextPrefs);
					publishPromptOverlayMaxLines(nextPrefs);
					publishChatContentVisibility(nextPrefs);
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
					setMessage(error?.message || t("bridge.err_read_status"));
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
				const looksLikePrefs = value.language !== undefined || value.confirmQuitWhenBusy !== undefined || value.trayEnabled !== undefined || value.closeToTray !== undefined || value.traySessionLimit !== undefined || value.showCopySessionId !== undefined || value.deleteSessionActions !== undefined || value.hoverMessageActions !== undefined || value.chatContentVisibility !== undefined || value.restoreLastSession !== undefined || value.rememberWindowSize !== undefined || value.supported !== undefined || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "setShowCopySessionId" || endpoint === "setDeleteSessionActions" || endpoint === "setHoverMessageActions" || endpoint === "setChatContentVisibility" || endpoint === "setRestoreLastSession" || endpoint === "setRememberWindowSize" || endpoint === "setShortcuts" || endpoint === "prefs" || value.shortcuts !== undefined;
				const looksLikeStatus = !looksLikeUpdate && !looksLikePrefs && (value.options !== undefined || processStates.has(value.state) || endpoint === "status" || endpoint === "start" || endpoint === "restart" || endpoint === "stop" || endpoint === "reloadChat");
				if (looksLikeStatus) setStatus(value);
				if (looksLikePrefs) setPrefs(value);
				if (looksLikeUpdate) setUpdate(value);
				if (value.version && endpoint === "appVersion") setAppVersion(value.version);
				publishShowCopySessionId(value);
				publishDeleteSessionActions(value);
				publishHoverMessageActions(value);
				publishPromptOverlayLanguage(value);
				publishPromptOverlayMaxLines(value);
				publishChatContentVisibility(value);
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
				const quiet = opts.quiet === true || endpoint === "reportCurrentSession" || endpoint === "clearLastSession" || endpoint === "setLanguage" || endpoint === "setConfirmQuitWhenBusy" || endpoint === "setTrayEnabled" || endpoint === "setCloseToTray" || endpoint === "setTraySessionLimit" || endpoint === "setShowCopySessionId" || endpoint === "setHoverMessageActions" || endpoint === "setChatContentVisibility" || endpoint === "setRestoreLastSession" || endpoint === "setRememberWindowSize" || endpoint === "setShortcuts" || endpoint === "setAutoCheckUpdate";
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
					setMessage(error?.message || t("bridge.err_manage"));
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
			const enhancementDisabled = Boolean(transport && transport.compatible === false && transport.capabilities);
			const transportLabel = !transport
				? t("bridge.handshake_negotiating")
				: enhancementDisabled
					? t("bridge.handshake_incompatible")
					: (transport.mode === "http-fallback" ? t("bridge.transport_fallback") : t("bridge.transport_loopback"));
			const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || "") || /Mac OS X/.test(navigator.userAgent || "");
			const DEFAULT_SHORTCUTS = {
				openSettings: "CmdOrCtrl+,",
				closeChat: "CmdOrCtrl+w",
				quit: "CmdOrCtrl+q",
				hide: "CmdOrCtrl+h",
				hideOthers: "CmdOrCtrl+OptionOrAlt+h"
			};
			const SHORTCUT_LABEL_KEYS = {
				openSettings: "shortcut.open_settings_label",
				closeChat: "shortcut.close_chat_label",
				quit: "shortcut.quit_label",
				hide: "shortcut.hide_label",
				hideOthers: "shortcut.hide_others_label"
			};
			// A shortcut id without a catalog entry still renders itself instead of a blank row.
			const shortcutLabel = (id) => (SHORTCUT_LABEL_KEYS[id] ? t(SHORTCUT_LABEL_KEYS[id]) : id);
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
						setMessage(t("shortcut.invalid"));
						setMessageKind("error");
						return;
					}
					const id = recordingShortcutId;
					const current = Object.assign({}, DEFAULT_SHORTCUTS, prefs?.shortcuts || {});
					const want = normalizeAccelCompare(parsed.accel);
					for (const otherId of Object.keys(current)) {
						if (otherId === id) continue;
						if (normalizeAccelCompare(current[otherId]) === want && current[otherId] !== "") {
							setMessage(t("shortcut.conflict", shortcutLabel(otherId)));
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
			// The catalog hint carries {0} where the inline shortcut chip goes. Split on that
			// token so the chip keeps its kbd styling and the wording still comes from the catalog.
			const hintWithShortcut = (key, id, label) => {
				const template = t(key);
				const at = template.indexOf("{0}");
				if (at < 0) return template;
				return [template.slice(0, at), inlineShortcut(id, label), template.slice(at + 3)];
			};
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
						jsx("div", { className: "dshDesktopBridgeTitle", children: shortcutLabel(id) }),
						jsxs("div", {
							className: "dshDesktopBridgeShortcutActions",
							children: [
								jsx("kbd", {
									className: "dshDesktopBridgeKbd" + (cleared && !recording ? " is-cleared" : "") + (recording ? " is-recording" : ""),
									role: "button",
									tabIndex: 0,
									title: t("shortcut.recording"),
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
									children: recording ? t("shortcut.recording") : (cleared ? t("shortcut.cleared") : (formatAccel(accel) || accel))
								}),
								jsx("button", {
									className: "dshDesktopBridgeSelector",
									type: "button",
									disabled: !connected || pending || !prefs || cleared,
									onClick: () => {
										setRecordingShortcutId(null);
										void setOneShortcut(id, "");
									},
									children: t("shortcut.clear")
								}),
								jsx("button", {
									className: "dshDesktopBridgeSelector",
									type: "button",
									disabled: !connected || pending || !prefs || isDefault,
									onClick: () => {
										setRecordingShortcutId(null);
										void setOneShortcut(id, defaultAccel);
									},
									children: t("shortcut.reset")
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
						jsxs("div", {
							role: "button",
							tabIndex: 0,
							className: "dshDesktopBridgeCardTitleButton dshDesktopBridgeStatusHeader",
							"aria-expanded": statusOpen,
							onClick: () => setStatusOpen((prev) => !prev),
							onKeyDown: (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									setStatusOpen((prev) => !prev);
								}
							},
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeStatusHeaderLeft",
									children: [
										jsx("span", { children: t("bridge.card_status") }),
										jsxs("span", {
											className: "dshDesktopBridgePill",
											children: [
												jsx("span", { className: "dshDesktopBridgeDot", "data-link": link }),
												jsx("span", { children: linkLabel(link) })
											]
										}),
										jsxs("span", {
											className: "dshDesktopBridgePill",
											children: [
												jsx("span", { className: "dshDesktopBridgeDot", "data-state": state }),
												jsx("span", { children: "DSH " + stateLabel(state) })
											]
										})
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeStatusHeaderRight",
									children: [
										!statusOpen ? jsx("button", {
											className: "dshDesktopBridgeSelector dshDesktopBridgeHeaderAction",
											type: "button",
											disabled: !connected || busy,
											onClick: (e) => {
												e.stopPropagation();
												void invoke("reloadChat", {
													executable: draft.executable,
													home: draft.home,
													workspace: draft.workspace
												}, state === "running" ? t("bridge.msg_requested_restart") : t("bridge.msg_requested_start"), { heavy: true });
											},
											onKeyDown: (e) => {
												e.stopPropagation();
											},
											children: state === "running" ? t("bridge.restart_open_chat") : t("btn.start_open_chat")
										}) : null,
										jsx("svg", {
											className: "dshDesktopBridgeCardChevron",
											"data-open": statusOpen ? "true" : "false",
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
								})
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeCardBody",
							hidden: !statusOpen,
							children: [
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.capability_title") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: transportLabel })
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.connection_title") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("bridge.connection_desc") })
									]
								}),
								jsxs("div", {
									className: "dshDesktopBridgeControl",
									children: [
										jsxs("span", {
											className: "dshDesktopBridgeStatus",
											children: [
												jsx("span", { className: "dshDesktopBridgeDot", "data-link": link }),
												jsx("span", { children: linkLabel(link) })
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
											children: t("bridge.reconnect")
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
												jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.process_title") }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: options.executable ? t("bridge.cli_configured", options.executable) : t("bridge.cli_unset") }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: t("bridge.cli_version", status?.cliVersion && status.cliVersion !== "unknown" ? status.cliVersion : "—") }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: options.port ? t("bridge.address", "http://127.0.0.1:" + options.port + "/") : t("bridge.address_not_ready") }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: appVersion ? t("bridge.desktop_version", appVersion) : t("bridge.desktop_version", "—") })
											]
										}),
										jsxs("div", {
											className: "dshDesktopBridgeControl",
											children: [
												jsxs("span", {
													className: "dshDesktopBridgeStatus",
													children: [
														jsx("span", { className: "dshDesktopBridgeDot", "data-state": state }),
														jsx("span", { children: stateLabel(state) })
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
											}, state === "running" ? t("bridge.msg_requested_restart") : t("bridge.msg_requested_start"), { heavy: true }),
											children: state === "running" ? t("bridge.restart_open_chat") : t("btn.start_open_chat")
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openManagement", {}),
											children: t("bridge.open_cold_start")
										})
									]
								})
							]
						}),
						]
						})
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
								jsx("span", { children: t("bridge.path_label") }),
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
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.executable") })
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
											onClick: () => void invoke("chooseExecutable", {}, t("bridge.msg_chose_executable")),
											children: t("bridge.choose")
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
											onClick: () => void invoke("chooseHome", {}, t("bridge.msg_chose_home")),
											children: t("bridge.choose")
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openHome", { home: draft.home, workspace: draft.workspace }),
											children: t("bridge.open")
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
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.workspace") })
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
											onClick: () => void invoke("chooseWorkspace", {}, t("bridge.msg_chose_workspace")),
											children: t("bridge.choose")
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openWorkspace", { home: draft.home, workspace: draft.workspace }),
											children: t("bridge.open")
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.apply_paths") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("bridge.apply_paths_hint") })
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
										}, t("bridge.msg_applied_paths")),
										children: t("bridge.apply_paths")
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
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: t("bridge.card_prefs") }),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsx("div", {
									className: "dshDesktopBridgeRowText",
									children: jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.language") })
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx(PillSelect, {
										value: prefs?.language || "",
										disabled: !connected || pending || !prefs,
										onChange: (language) => void invoke("setLanguage", { language }),
										options: [
											{ value: "", label: t("lang.system") },
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.restore_last_session") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.restore_last_session_hint") })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.restoreLastSession !== false,
										checked: prefs?.restoreLastSession !== false,
										disabled: !connected || pending || !prefs,
										onChange: (event) => void invoke("setRestoreLastSession", { enabled: event.target.checked })
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.remember_window_size") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.remember_window_size_hint") })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.rememberWindowSize !== false,
										checked: prefs?.rememberWindowSize !== false,
										disabled: !connected || pending || !prefs,
										onChange: (event) => void invoke("setRememberWindowSize", { enabled: event.target.checked })
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.confirm_quit") }),
										jsxs("div", { className: "dshDesktopBridgeDesc", children: quitShortcutLabel
											? hintWithShortcut("field.confirm_quit_hint_dashboard", "quit", quitShortcutLabel)
											: t("field.confirm_quit_hint_dashboard_none")
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
						// One grouped block: the master toggle decides whether the other two mean anything
						// at all, so the three tray settings read as one thing instead of three unrelated
						// rows. Only the outer row keeps a divider (below the whole group).
						jsxs("div", {
							className: "dshDesktopBridgeRow dshDesktopBridgeRowStacked",
							children: [
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.tray_enabled") }),
										jsxs("div", { className: "dshDesktopBridgeDesc", children: closeChatShortcutLabel
											? hintWithShortcut("field.tray_enabled_hint_dashboard", "closeChat", closeChatShortcutLabel)
											: t("field.tray_enabled_hint_dashboard_none")
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.tray_session_limit") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.tray_session_limit_hint_dashboard") })
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.close_to_tray") }),
										jsxs("div", { className: "dshDesktopBridgeDesc", children: quitShortcutLabel
											? hintWithShortcut("field.close_to_tray_hint_dashboard", "quit-tray", quitShortcutLabel)
											: t("field.close_to_tray_hint_dashboard_none")
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
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: t("bridge.card_enhancements") }),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.show_copy_session_id") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.show_copy_session_id_hint") })
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
										disabled: !connected || pending || !prefs || enhancementDisabled,
										onChange: (event) => void invoke("setShowCopySessionId", { enabled: event.target.checked })
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
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.delete_session_actions") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.delete_session_actions_hint") })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.deleteSessionActions !== false,
										checked: prefs?.deleteSessionActions !== false,
										disabled: !connected || pending || !prefs || enhancementDisabled,
										onChange: (event) => void invoke("setDeleteSessionActions", { enabled: event.target.checked })
									})
								})
							]
						}),
						// One grouped block: the toggle decides whether the card exists, and the line
						// budget only means something once it does, so they belong together rather than
						// as two unrelated rows.
						// One grouped setting on two lines. Both lines are ordinary rows, so they inherit the
						// panel typography; only the outer row keeps a divider (below the whole setting).
						jsxs("div", {
							className: "dshDesktopBridgeRow dshDesktopBridgeRowStacked",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRow",
									children: [
											jsxs("div", {
												className: "dshDesktopBridgeRowText",
												children: [
													jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.enhanced_hover_title") }),
													jsx("div", { className: "dshDesktopBridgeDesc", children: t("bridge.enhanced_hover_hint") })
												]
											}),
										jsx("div", {
											className: "dshDesktopBridgeControl",
											children: jsx("input", {
												className: "dshDesktopBridgeToggle",
												type: "checkbox",
												role: "switch",
												"aria-checked": prefs?.hoverMessageActions !== false,
												checked: prefs?.hoverMessageActions !== false,
												disabled: !connected || pending || !prefs || enhancementDisabled,
												onChange: (event) => void invoke("setHoverMessageActions", { enabled: event.target.checked })
											})
										})
									]
								}),
								// The line budget only means something while the card exists.
								prefs?.hoverMessageActions !== false
									? jsxs("div", {
										className: "dshDesktopBridgeRow",
										children: [
											jsxs("div", {
												className: "dshDesktopBridgeRowText",
												children: [
													jsx("div", { className: "dshDesktopBridgeTitle", children: t("bridge.overlay_max_lines") }),
													jsx("div", { className: "dshDesktopBridgeDesc", children: t("bridge.overlay_max_lines_hint") })
												]
											}),
											jsx("div", {
												className: "dshDesktopBridgeControl",
												// The input alone is the readout: its value is derived from the clamped pref,
												// so it already re-renders with whatever the host accepted. A separate
												// "5 行" label next to it only printed the same number twice.
												children: jsx("input", {
													className: "dshDesktopBridgeNumber",
													type: "number",
													min: String(PROMPT_OVERLAY_MIN_LINES),
													max: String(PROMPT_OVERLAY_MAX_LINES),
													step: "1",
													value: String(promptOverlayMaxLinesFromPrefs(prefs)),
													"aria-label": t("bridge.overlay_max_lines"),
													// The range the host will clamp to, so the limit is discoverable.
													title: PROMPT_OVERLAY_MIN_LINES + "–" + PROMPT_OVERLAY_MAX_LINES,
													disabled: !connected || pending || !prefs || enhancementDisabled,
													onChange: (event) => void invoke("setPromptOverlayMaxLines", { lines: Number(event.target.value) })
												})
											})
										]
									})
									: null
							]
						}),
						jsxs("div", {
							className: "dshDesktopBridgeRow",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeRowText",
									children: [
										jsx("div", { className: "dshDesktopBridgeTitle", children: t("field.chat_content_visibility") }),
										jsx("div", { className: "dshDesktopBridgeDesc", children: t("field.chat_content_visibility_hint") })
									]
								}),
								jsx("div", {
									className: "dshDesktopBridgeControl",
									children: jsx("input", {
										className: "dshDesktopBridgeToggle",
										type: "checkbox",
										role: "switch",
										"aria-checked": prefs?.chatContentVisibility !== false,
										checked: prefs?.chatContentVisibility !== false,
										disabled: !connected || pending || !prefs || enhancementDisabled,
										onChange: (event) => void invoke("setChatContentVisibility", { enabled: event.target.checked })
									})
								})
							]
						})
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: t("dashboard.shortcuts_title") }),
						jsx("div", {
							className: "dshDesktopBridgeDesc",
							style: { padding: "0 0 8px" },
							children: t("dashboard.shortcuts_hint")
						}),
						...shortcutRows,
						]
					}),
					jsxs("div", {
						className: "dshDesktopBridgeCard",
						children: [
						jsx("div", { className: "dshDesktopBridgeCardTitle", children: t("dashboard.update_title") }),
						jsxs("div", {
							className: "dshDesktopBridgeStack",
							children: [
								jsxs("div", {
									className: "dshDesktopBridgeStackMain",
									children: [
										jsxs("div", {
											className: "dshDesktopBridgeRowText",
											children: [
												jsx("div", { className: "dshDesktopBridgeTitle", children: t("dashboard.update_title") }),
												jsx("div", {
													className: "dshDesktopBridgeDesc",
													children: update?.latestVersion
														? t("bridge.version_latest", update.latestVersion, update.currentVersion || appVersion || "—")
														: t("bridge.version_current", update?.currentVersion || appVersion || "—")
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
												jsx("div", { className: "dshDesktopBridgeTitle", children: t("dashboard.auto_check") }),
												jsx("div", { className: "dshDesktopBridgeDesc", children: t("dashboard.update_hint") })
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
											onClick: () => void invoke("checkUpdate", {}, t("bridge.msg_check_update")),
											children: t("btn.check_update")
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector dshDesktopBridgePrimary",
											type: "button",
											disabled: !connected || pending || (update?.state !== "available" && update?.state !== "ready"),
											onClick: () => void invoke("installUpdate", {}, t("bridge.msg_install_update")),
											children: t("btn.install_update")
										}),
										jsx("button", {
											className: "dshDesktopBridgeSelector",
											type: "button",
											disabled: !connected || pending,
											onClick: () => void invoke("openReleasePage", {}),
											children: t("btn.open_release")
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

		const inject = ["slots", "connection", "sessions", "remote", "uiWorkspace", "workspaces", "layout"];
		const OPEN_SESSION_EVENT = "dsh-desktop-open-session";
		const OPEN_SESSION_PENDING_GLOBAL = "__DSH_DESKTOP_OPEN_SESSION_PENDING__";
		const OPEN_SESSION_FAST_GLOBAL = "__DSH_DESKTOP_OPEN_SESSION__";
		const OPEN_SESSION_WARM_MS = 400;
		const OPEN_SESSION_WARM_LIMIT = 5;
		const OPEN_SESSION_WARM_CHUNK = 5;
		const OPEN_SESSION_WARM_LIMIT_MAX = 20;
		function apply(ctx) {
			// Capture the connection first: prefs syncs below publish the language and may
			// trigger a catalog load, which needs this to be set already.
			localeConnection = ctx.connection;
			// Chat is a remote HTTP document: Wails Core does not expose Call.ByName.
			// Use the existing authenticated DSH RPC; native bridge credentials stay host-side.
			if (typeof window !== "undefined") {
				const invokeNative = async (endpoint, payload) => {
					const result = await callDesktopRPC(ctx.connection, endpoint, payload);
					if (!result?.ok) throw new Error(desktopErrorMessage(result?.error));
					return result.value;
				};
				const actions = {
					__DSH_DESKTOP_OPEN_EXTERNAL_URL__: (url) => invokeNative("openExternalURL", { url }),
					__DSH_DESKTOP_WINDOW_ACTION__: (action) => invokeNative("chatWindowAction", { action }),
					__DSH_DESKTOP_CONTEXT_MENU__: (payload) => invokeNative("showChatContextMenu", payload),
				};
				for (const [name, handler] of Object.entries(actions)) window[name] = handler;
				ctx.effect(() => () => {
					for (const [name, handler] of Object.entries(actions)) {
						if (window[name] === handler) delete window[name];
					}
				});
			}
			installStyle();
			void ensureDesktopHandshake(ctx.connection);
			let trayEnabled = false;
			let warmLimit = OPEN_SESSION_WARM_LIMIT;
			let lastListState = null;
			const trayRecentSessionsEnabled = () => trayEnabled && warmLimit > 0;
			const applyWarmPrefs = (prefs) => {
				let changed = false;
				const enabled = prefs?.trayEnabled === true;
				if (enabled !== trayEnabled) {
					trayEnabled = enabled;
					changed = true;
				}
				const n = Number(prefs?.traySessionLimit);
				if (Number.isFinite(n)) {
					const next = Math.max(0, Math.min(OPEN_SESSION_WARM_LIMIT_MAX, Math.floor(n)));
					if (next !== warmLimit) {
						warmLimit = next;
						changed = true;
					}
				}
				return changed;
			};
			callDesktopRPC(ctx.connection, "prefs", {}).then((result) => {
				if (!result?.ok) return;
				publishShowCopySessionId(result.value);
				publishDeleteSessionActions(result.value);
				publishHoverMessageActions(result.value);
				publishPromptOverlayLanguage(result.value);
				publishPromptOverlayMaxLines(result.value);
				publishChatContentVisibility(result.value);
				if (applyWarmPrefs(result.value) && lastListState) scheduleWarm(lastListState);
			}).catch(() => {});
			const stopNavIcon = installDesktopNavIcon();
			const stopCopySessionIdMenu = installCopySessionIdMenu();
			const stopDeleteSessionMenu = installDeleteSessionMenu(ctx);
			const stopArchivedSessionDelete = installArchivedSessionDelete(ctx);
			const stopArchivedSessionBatch = installArchivedSessionBatch(ctx);
			const stopHoverMessageActions = installHoverMessageActions(ctx);
			const stopChatContentVisibility = installChatContentVisibility();
			if (typeof ctx.effect === "function") {
				ctx.effect(() => () => {
					stopNavIcon();
					stopCopySessionIdMenu();
					stopDeleteSessionMenu();
					stopArchivedSessionDelete();
					stopArchivedSessionBatch();
					stopHoverMessageActions();
					stopChatContentVisibility();
				});
			}
			// First-class settings nav entry (same slot as Models / Plugins / Market).
			// Do NOT use a sticky globalThis guard: Cordis HMR disposes the fiber and
			// re-applies; a sticky flag would skip re-registration and hide 「桌面设置」
			// without restarting the desktop app (exactly after hot-updating overlay).
			// The nav caches its label from the first render, which can happen before the async
			// catalog arrives; with no catalog t() can only answer in English. Register at once so
			// the entry always exists, then re-register when the language actually changes so the
			// label localizes (and follows a later switch).
			let disposeDesktopNav = null;
			const registerDesktopNav = () => {
				if (typeof disposeDesktopNav === "function") {
					try { disposeDesktopNav(); } catch (_) { /* re-register below regardless */ }
				}
				disposeDesktopNav = ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "deepseek-harness-desktop",
					// Before built-in general (order 0) / models (10) / plugins (15).
					order: -10,
					label: () => t("tray.open_settings")
				}, () => jsx(DesktopSettingsTab, { connection: ctx.connection })));
			};
			registerDesktopNav();
			onLocaleChange(() => registerDesktopNav());

			// Official busy signal: SessionSummary.running from api-session-controller
			// (api-session/status). Push to the desktop loopback for Cmd+Q confirm.
			let lastBusy = null;
			const pushBusy = (busy) => {
				if (lastBusy === busy) return;
				lastBusy = busy;
				void callDesktopRPC(ctx.connection, "reportChatBusy", { busy }).catch(() => {});
			};
			let lastSessionsKey = null;
			const pushSessions = (payload) => {
				const key = JSON.stringify(payload);
				if (lastSessionsKey === key) return;
				lastSessionsKey = key;
				void callDesktopRPC(ctx.connection, "reportSessions", payload).catch(() => {});
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
			let latestOpenRequestId = 0;
			let lastOpenedSessionId = "";
			let lastOpenedSessionAt = 0;
			let warmTimer = null;
			const layoutOf = () => (typeof ctx.get === "function" ? ctx.get("layout") : ctx.layout);
			const dismissChrome = () => {
				try {
					const layout = layoutOf();
					if (layout && typeof layout.selectPanel === "function") layout.selectPanel(null);
				} catch (_) { /* layout may still be settling */ }
				try {
					if (typeof KeyboardEvent === "function") {
						window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
					}
				} catch (_) { /* overlay dismiss is best-effort */ }
			};
			const prefetchSessionHistory = (id) => {
				try {
					const session = ctx.sessions && typeof ctx.sessions.binding === "function"
						? ctx.sessions.binding(id)?.session
						: null;
					if (session && typeof session.open === "function") void session.open();
				} catch (_) { /* warming is best-effort; navigation still proceeds */ }
			};
			let lastReportedActiveSessionId = "";
			const resolveCurrentSessionId = () => {
				// 1. Try localStorage "dsh.sessions.current" (DSH persistent selection store)
				try {
					if (typeof localStorage !== "undefined") {
						const raw = localStorage.getItem("dsh.sessions.current");
						if (raw) {
							const parsed = JSON.parse(raw);
							const sid = String(parsed?.sessionId || "").trim();
							if (sid) return sid;
						}
					}
				} catch (_) {}

				// 2. Try uiWorkspace mainReference / selection
				try {
					const uiWorkspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
					const fromMain = uiWorkspace?.mainReference?.sessionId;
					if (fromMain) return String(fromMain).trim();
					const fromSel = uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
					if (fromSel) return String(fromSel).trim();
				} catch (_) {}

				// 3. Try sessions list snapshot mainView retention
				try {
					const snap = typeof ctx.sessions?.list?.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
					if (snap?.byId) {
						for (const s of Object.values(snap.byId)) {
							if (s && (s.retainedBy?.mainView ?? 0) > 0) {
								const sid = String(s.id || s.sessionId || "").trim();
								if (sid) return sid;
							}
						}
					}
					if (snap?.current) return String(snap.current).trim();
				} catch (_) {}

				return "";
			};

			const isSessionValidForRestore = (sessionId) => {
				if (!sessionId) return false;
				try {
					const snap = typeof ctx.sessions?.list?.getSnapshot === "function" ? ctx.sessions.list.getSnapshot() : null;
					if (snap?.byId && snap.byId[sessionId]) {
						const s = snap.byId[sessionId];
						if (s.blank || s.archived || s.isArchived || s.origin === "subagent") return false;
					}
					const archived = archivedSessionIds();
					if (archived.includes(sessionId)) return false;
				} catch (_) {}
				return true;
			};

			const checkAndReportActiveSession = () => {
				const sid = resolveCurrentSessionId();
				// Publish before validity checks: the overlay must clear on an in-flight session switch
				// even when the new row is not in the settled list yet.
				publishActiveSessionId(sid);
				if (!sid) return;
				if (sid === lastReportedActiveSessionId) return;
				if (!isSessionValidForRestore(sid)) return;
				lastReportedActiveSessionId = sid;
				void callDesktopRPC(ctx.connection, "reportCurrentSession", { sessionId: sid }).catch(() => {});
			};

			const markOpened = (id) => {
				if (pendingOpenSessionId === id) pendingOpenSessionId = "";
				lastOpenedSessionId = id;
				lastOpenedSessionAt = Date.now();
				checkAndReportActiveSession();
			};
			const cancelWarm = () => {
				if (warmTimer !== null && typeof clearTimeout === "function") clearTimeout(warmTimer);
				warmTimer = null;
			};
			const recentWarmIds = (sessions, limit, current) => {
				if (!limit || !Array.isArray(sessions) || sessions.length === 0) return [];
				const seen = new Set();
				const rows = [];
				for (const s of sessions) {
					if (!s || s.blank || s.archived || s.origin === "subagent") continue;
					const sid = String(s.id || "").trim();
					if (!sid || sid === current || seen.has(sid)) continue;
					seen.add(sid);
					rows.push(s);
				}
				rows.sort((a, b) => {
					const ua = typeof a.updatedAt === "number" ? a.updatedAt : 0;
					const ub = typeof b.updatedAt === "number" ? b.updatedAt : 0;
					if (ua !== ub) return ub - ua;
					return String(a.id).localeCompare(String(b.id));
				});
				return rows.slice(0, limit).map((s) => s.id);
			};
			const warmRecentHistories = (listState) => {
				if (pendingOpenSessionId) return;
				const ids = recentWarmIds(
					sessionsFromSnapshot(listState, archivedSessionIds()).sessions,
					warmLimit,
					listState && listState.current
				);
				const pump = () => {
					if (pendingOpenSessionId) return;
					const chunk = ids.splice(0, OPEN_SESSION_WARM_CHUNK);
					if (!chunk.length) return;
					for (const id of chunk) prefetchSessionHistory(id);
					if (!ids.length) return;
					if (typeof setTimeout !== "function") {
						pump();
						return;
					}
					warmTimer = setTimeout(() => {
						warmTimer = null;
						pump();
					}, 0);
				};
				pump();
			};
			const scheduleWarm = (listState) => {
				lastListState = listState;
				if (typeof setTimeout !== "function") return;
				cancelWarm();
				if (!trayRecentSessionsEnabled()) return;
				warmTimer = setTimeout(() => {
					warmTimer = null;
					warmRecentHistories(listState);
				}, OPEN_SESSION_WARM_MS);
			};
			const flushPendingOpenSession = () => {
				const id = pendingOpenSessionId;
				if (!id) return;
				const snap = typeof ctx.sessions?.list?.getSnapshot === "function"
					? ctx.sessions.list.getSnapshot()
					: null;
				if (!snap) return;

				const exists = Boolean(snap.byId && snap.byId[id]);
				const isArchived = exists && (
					archivedSessionIds().includes(id) ||
					Boolean(snap.byId[id]?.archived) ||
					Boolean(snap.byId[id]?.isArchived)
				);

				if (exists && !isArchived) {
					try {
						const current = resolveCurrentSessionId();
						// Already on this session: skip select/history (idempotent but not free)
						// and only dismiss Settings / Escape-closable overlays.
						if (current === id || snap.current === id) {
							dismissChrome();
							markOpened(id);
							pendingOpenSessionId = "";
							return;
						}
						const uiWorkspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
						if (!uiWorkspace || typeof uiWorkspace.openSession !== "function") return;
						uiWorkspace.openSession(id);
						markOpened(id);
						pendingOpenSessionId = "";
					} catch (_) { /* list/service may still be settling; retry on next snapshot */ }
					return;
				}

				// Fallback: only drop when the session list is fully settled (phase === "ready")
				// Never drop while phase is "pending"!
				const isSettled = snap.phase === "ready" || (snap.phase === undefined && snap.byId && Object.keys(snap.byId).length > 0);
				if (isSettled && snap.phase !== "pending" && (!exists || isArchived)) {
					pendingOpenSessionId = "";
					void callDesktopRPC(ctx.connection, "clearLastSession", {}).catch(() => {});
				}
			};
			const queueOpenSession = (sessionId, fromEvent = false, requestId = 0) => {
				const id = String(sessionId || "").trim();
				if (!id) return;
				// Sequence identifies a native click, unlike a session ID or time window.
				// Late claim/event delivery cannot override a newer click or sidebar choice.
				if (Number.isSafeInteger(requestId) && requestId > 0) {
					if (requestId <= latestOpenRequestId) return;
					latestOpenRequestId = requestId;
				}
				if (!requestId && fromEvent && lastOpenedSessionId === id && Date.now() - lastOpenedSessionAt < OPEN_SESSION_DEDUPE_MS) {
					let current = "";
					try {
						current = ctx.sessions?.list?.getSnapshot?.()?.current || "";
					} catch (_) { /* allow the event to retry */ }
					if (current === id) return;
				}
				cancelWarm();
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
				const requestId = window.__DSH_DESKTOP_OPEN_SESSION_PENDING_REQUEST_ID__ || 0;
				window.__DSH_DESKTOP_OPEN_SESSION_PENDING_REQUEST_ID__ = 0;
				if (id) queueOpenSession(id, false, requestId);
			};
			const syncBusy = () => {
				try {
					const snap = typeof ctx.sessions?.list?.getSnapshot === "function"
						? ctx.sessions.list.getSnapshot()
						: null;
					const current = resolveCurrentSessionId();
					const isCurrentValid = isSessionValidForRestore(current);

					pushBusy(anySessionRunning(snap));
					const sessionData = sessionsFromSnapshot(snap, archivedSessionIds());
					pushSessions({
						sessions: sessionData.sessions,
						clearErrors: sessionData.clearErrors,
						currentSessionId: isCurrentValid ? current : ""
					});
					checkAndReportActiveSession();
					flushPendingOpenSession();
					scheduleWarm(snap);
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
			const uiWorkspace = typeof ctx.get === "function" ? ctx.get("uiWorkspace") : ctx.uiWorkspace;
			if (uiWorkspace?.selection && typeof uiWorkspace.selection.subscribe === "function") {
				ctx.effect(() => uiWorkspace.selection.subscribe(() => {
					syncBusy();
					checkAndReportActiveSession();
				}));
			}

			const handleClaimedOpenSession = (result) => {
				const id = result && result.ok && result.value ? result.value.sessionId : "";
				if (!id) return false;
				const requestId = result.value.requestId;
				if (Number.isSafeInteger(requestId) && requestId > 0) {
					queueOpenSession(id, false, requestId);
					return true;
				}
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
			const claimOpenSession = () => callDesktopRPC(ctx.connection, "claimOpenSession", {})
				.then(handleClaimedOpenSession)
				.catch(() => false);
			const onOpenSession = (event) => {
				const id = event && event.detail;
				consumeQueuedOpenSession(id);
				queueOpenSession(id, true, event?.desktopRequestId || 0);
			};
			if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
				window.addEventListener(OPEN_SESSION_EVENT, onOpenSession);
				window[OPEN_SESSION_FAST_GLOBAL] = (sessionId, requestId = 0) => {
					consumeQueuedOpenSession(sessionId);
					queueOpenSession(sessionId, true, requestId);
				};
				const onStorage = (event) => {
					if (event && event.key === "dsh.sessions.current") checkAndReportActiveSession();
				};
				window.addEventListener("storage", onStorage);
				let monitorTimer = null;
				if (typeof setInterval === "function") {
					monitorTimer = setInterval(checkAndReportActiveSession, 1000);
				}
				if (typeof ctx.effect === "function") {
					ctx.effect(() => () => {
						window.removeEventListener(OPEN_SESSION_EVENT, onOpenSession);
						window.removeEventListener("storage", onStorage);
						if (window[OPEN_SESSION_FAST_GLOBAL]) window[OPEN_SESSION_FAST_GLOBAL] = undefined;
						if (monitorTimer !== null) clearInterval(monitorTimer);
						cancelWarm();
					});
				}
				drainQueuedOpenSession();
				checkAndReportActiveSession();
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
