/** Built-in desktop bridge host: authenticated RPC → loopback control plane. */
const name = "deepseek-harness-desktop-bridge";
// Wait for connection (auth fence) + webServer (route table). We register the
// Cordis RPC prefix ourselves — connection.rpc.handle's owner.webServer path is
// unreliable for --patch plugins (405 / missing inject). Mirror the wire protocol
// the browser client uses: POST /desktop-bridge/<endpoint> + client-request JSON.
const inject = ["connection", "webServer"];

const channel = "/desktop-bridge";
const endpointFileVar = "DSH_DESKTOP_BRIDGE_ENDPOINT_FILE";
const urlVar = "DSH_DESKTOP_BRIDGE_URL";
const tokenVar = "DSH_DESKTOP_BRIDGE_TOKEN";
const tokenHeader = "X-DSH-Desktop-Bridge-Token";

const routes = Object.freeze({
	status: Object.freeze({ method: "GET", path: "/v1/status" }),
	ping: Object.freeze({ method: "GET", path: "/v1/ping" }),
	capabilities: Object.freeze({ method: "GET", path: "/v1/capabilities" }),
	handshake: Object.freeze({ method: "POST", path: "/v1/handshake" }),
	start: Object.freeze({ method: "POST", path: "/v1/start" }),
	restart: Object.freeze({ method: "POST", path: "/v1/restart" }),
	reloadChat: Object.freeze({ method: "POST", path: "/v1/reload-chat" }),
	openManagement: Object.freeze({ method: "POST", path: "/v1/open-management" }),
	chooseExecutable: Object.freeze({ method: "POST", path: "/v1/choose-executable" }),
	chooseHome: Object.freeze({ method: "POST", path: "/v1/choose-home" }),
	chooseWorkspace: Object.freeze({ method: "POST", path: "/v1/choose-workspace" }),
	openHome: Object.freeze({ method: "POST", path: "/v1/open-home" }),
	openWorkspace: Object.freeze({ method: "POST", path: "/v1/open-workspace" }),
	openSettingsYaml: Object.freeze({ method: "POST", path: "/v1/open-settings-yaml" }),
	prefs: Object.freeze({ method: "GET", path: "/v1/prefs" }),
	// Localized UI catalog for the Chat-side desktop settings panel.
	localeBundle: Object.freeze({ method: "GET", path: "/v1/locale-bundle" }),
	setLanguage: Object.freeze({ method: "POST", path: "/v1/set-language" }),
	setConfirmQuitWhenBusy: Object.freeze({ method: "POST", path: "/v1/set-confirm-quit" }),
	setTrayEnabled: Object.freeze({ method: "POST", path: "/v1/set-tray-enabled" }),
	setCloseToTray: Object.freeze({ method: "POST", path: "/v1/set-close-to-tray" }),
	setTraySessionLimit: Object.freeze({ method: "POST", path: "/v1/set-tray-session-limit" }),
	setShowCopySessionId: Object.freeze({ method: "POST", path: "/v1/set-show-copy-session-id" }),
	setHoverMessageActions: Object.freeze({ method: "POST", path: "/v1/set-hover-message-actions" }),
	setChatContentVisibility: Object.freeze({ method: "POST", path: "/v1/set-chat-content-visibility" }),
	setPromptOverlayMaxLines: Object.freeze({ method: "POST", path: "/v1/set-prompt-overlay-max-lines" }),
	setShortcuts: Object.freeze({ method: "POST", path: "/v1/set-shortcuts" }),
	updateStatus: Object.freeze({ method: "GET", path: "/v1/update-status" }),
	checkUpdate: Object.freeze({ method: "POST", path: "/v1/check-update" }),
	installUpdate: Object.freeze({ method: "POST", path: "/v1/install-update" }),
	openReleasePage: Object.freeze({ method: "POST", path: "/v1/open-release-page" }),
	setAutoCheckUpdate: Object.freeze({ method: "POST", path: "/v1/set-auto-check-update" }),
	appVersion: Object.freeze({ method: "GET", path: "/v1/app-version" }),
	reportChatBusy: Object.freeze({ method: "POST", path: "/v1/report-chat-busy" }),
	reportSessions: Object.freeze({ method: "POST", path: "/v1/report-sessions" }),
	claimOpenSession: Object.freeze({ method: "POST", path: "/v1/claim-open-session" })
});

/** Host-side sticky tray errors (turn/end error|interrupted + api-session/error). */
const stickySessionErrors = new Set();
let lastTraySessions = [];
let lastClearErrors = [];
let trayRepublishTimer = null;
let trayConfigGetter = null;

function markStickySessionError(sessionId) {
	const id = String(sessionId || "").trim();
	if (!id || stickySessionErrors.has(id)) return false;
	stickySessionErrors.add(id);
	return true;
}

function clearStickySessionError(sessionId) {
	const id = String(sessionId || "").trim();
	if (!id) return false;
	return stickySessionErrors.delete(id);
}

function mergeTraySessionErrors(sessions, clearErrors) {
	for (const id of clearErrors || []) clearStickySessionError(id);
	const out = [];
	const seen = new Set();
	for (const raw of sessions || []) {
		if (!raw || typeof raw !== "object") continue;
		const id = String(raw.id || "").trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const running = Boolean(raw.running);
		if (running) clearStickySessionError(id);
		out.push({
			id,
			title: typeof raw.title === "string" ? raw.title : "",
			updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
			running,
			error: !running && (Boolean(raw.error) || stickySessionErrors.has(id)),
			blank: Boolean(raw.blank),
			archived: Boolean(raw.archived),
			origin: typeof raw.origin === "string" ? raw.origin : ""
		});
	}
	return out;
}

function scheduleTraySessionsRepublish() {
	if (typeof trayConfigGetter !== "function") return;
	if (trayRepublishTimer) clearTimeout(trayRepublishTimer);
	trayRepublishTimer = setTimeout(() => {
		trayRepublishTimer = null;
		const sessions = mergeTraySessionErrors(lastTraySessions, []);
		void invoke(trayConfigGetter(), "reportSessions", { sessions }).catch(() => {});
	}, 50);
}

function validateURL(base) {

	let url;
	try {
		url = new URL(base);
	} catch {
		return undefined;
	}
	if (
		url.protocol !== "http:" ||
		url.hostname !== "127.0.0.1" ||
		url.username !== "" ||
		url.password !== "" ||
		(url.pathname !== "" && url.pathname !== "/") ||
		url.search !== "" ||
		url.hash !== ""
	) {
		return undefined;
	}
	return url.href.replace(/\/$/, "");
}

function configFromEnv() {
	const base = process.env[urlVar]?.trim();
	const token = process.env[tokenVar]?.trim();
	if (!base || !token) return undefined;
	const validated = validateURL(base);
	if (!validated) return undefined;
	return { base: validated, token, source: "env" };
}

async function configFromEndpointFile() {
	const path = process.env[endpointFileVar]?.trim();
	if (!path) return undefined;
	try {
		const { readFile } = await import("node:fs/promises");
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw);
		const base = typeof parsed?.url === "string" ? parsed.url.trim() : "";
		const token = typeof parsed?.token === "string" ? parsed.token.trim() : "";
		if (!base || !token) return undefined;
		const validated = validateURL(base);
		if (!validated) return undefined;
		return { base: validated, token, source: "file" };
	} catch {
		return undefined;
	}
}

async function resolveConfig(preferred) {
	if (preferred?.base && preferred?.token) {
		const validated = validateURL(preferred.base);
		if (validated) return { base: validated, token: preferred.token, source: preferred.source || "cached" };
	}
	const fromFile = await configFromEndpointFile();
	if (fromFile) return fromFile;
	return configFromEnv();
}

async function invoke(config, endpoint, payload, signal) {
	if (endpoint === "reportSessions" && payload && typeof payload === "object") {
		const sessions = mergeTraySessionErrors(payload.sessions, payload.clearErrors);
		lastTraySessions = sessions.map((s) => ({ ...s }));
		lastClearErrors = Array.isArray(payload.clearErrors) ? [...payload.clearErrors] : [];
		payload = { sessions };
	}
	const route = routes[endpoint];
	if (route === undefined) {
		return {
			ok: false,
			// Fallback text stays language-neutral; the client localizes by code.
			error: { code: "desktop-bridge/not-allowed", message: "Desktop bridge does not support this action", details: {} }
		};
	}
	const resolved = await resolveConfig(config);
	if (resolved === undefined) {
		return {
			ok: false,
			error: {
				code: "desktop-bridge/desktop-not-running",
				message: "Desktop control plane unavailable; start DSH from Deepseek Harness Desktop",
				details: {}
			}
		};
	}
	try {
		// Do not forward the Cordis/browser AbortSignal to the loopback control
		// plane. bridge() aborts that signal when the HTTP response socket
		// settles; rethrowing AbortError becomes opaque HTTP 500
		// ("handler failure: AbortError") in connection.rpc.handle / rpcFetchHandler.
		const init = {
			method: route.method,
			headers: { [tokenHeader]: resolved.token }
		};
		if (route.method === "POST" && payload !== undefined && payload !== null) {
			init.headers["Content-Type"] = "application/json; charset=utf-8";
			init.body = JSON.stringify(payload);
		}
		const response = await fetch(resolved.base + route.path, init);
		if (!response.ok) {
			let message = `Desktop rejected the action (HTTP ${response.status})`;
			try {
				const body = await response.json();
				if (typeof body?.error === "string" && body.error.trim()) message = body.error;
			} catch {
				/* ignore */
			}
			return {
				ok: false,
				error: { code: "desktop-bridge/rejected", message, details: { status: response.status } },
				config: resolved
			};
		}
		return { ok: true, value: await response.json(), config: resolved };
	} catch (error) {
		const aborted = error?.name === "AbortError" || (signal?.aborted === true);
		return {
			ok: false,
			error: {
				// Distinct codes so the client can localize each case; the message is a fallback.
				code: aborted ? "desktop-bridge/aborted" : "desktop-bridge/unavailable",
				message: aborted ? "Desktop bridge request was cancelled" : "Desktop control plane is temporarily unreachable",
				details: {}
			},
			config: resolved
		};
	}
}

const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;

function endpointFromPath(pathname) {
	if (!pathname.startsWith(`${channel}/`)) return undefined;
	const endpoint = pathname.slice(channel.length + 1);
	if (endpoint.split("/").some((segment) => segment === "" || segment === "." || segment === ".." || !ENDPOINT_SEGMENT_PATTERN.test(segment))) {
		return undefined;
	}
	return endpoint;
}

function writeJson(res, status, body) {
	const payload = Buffer.from(JSON.stringify(body), "utf8");
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(payload.byteLength),
		"cache-control": "no-store"
	});
	res.end(payload);
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
	const chunks = [];
	let received = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		received += buffer.byteLength;
		if (received > maxBytes) {
			const err = new Error("payload too large");
			err.statusCode = 413;
			throw err;
		}
		chunks.push(buffer);
	}
	if (!chunks.length) return undefined;
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		const err = new Error("body is not JSON");
		err.statusCode = 400;
		throw err;
	}
}

function serverResponse(rpcId, result) {
	return { type: "server-response", rpcId, result };
}

function unwrapConnection(connection) {
	if (!connection || typeof connection !== "object") return connection;
	// Cordis traceable proxies expose the target via a well-known original symbol.
	for (const sym of Object.getOwnPropertySymbols(connection)) {
		if (String(sym).includes("original")) {
			const target = connection[sym];
			if (target && typeof target.requestRejection === "function") return target;
		}
	}
	return connection;
}

function createRouteHandler(connection, getCached, setCached) {
	const host = unwrapConnection(connection);
	const rejectRequest = (req) => {
		if (typeof host.requestRejection === "function") return host.requestRejection(req);
		if (typeof connection.requestRejection === "function") return connection.requestRejection(req);
		return 500;
	};

	return async (req, res) => {
		let rpcId = "invalid-request";
		try {
			let rejection;
			try {
				rejection = rejectRequest(req);
			} catch (error) {
				writeJson(res, 200, serverResponse(rpcId, {
					ok: false,
					error: {
						code: "desktop-bridge/auth-failed",
						message: `requestRejection threw: ${error instanceof Error ? error.message : String(error)}`,
						details: {}
					}
				}));
				return;
			}
			if (rejection !== undefined) {
				res.writeHead(rejection);
				res.end(rejection === 401 ? "unauthorized" : "forbidden");
				return;
			}

			const pathname = new URL(req.url || "/", "http://dsh.internal").pathname;
			const endpoint = endpointFromPath(pathname);
			if (req.method !== "POST" || endpoint === undefined) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			const contentType = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
			if (contentType !== "application/json") {
				res.writeHead(415);
				res.end("content type must be application/json");
				return;
			}

			let body;
			try {
				body = await readJsonBody(req);
			} catch (error) {
				res.writeHead(error?.statusCode || 400);
				res.end(error?.message || "bad request");
				return;
			}
			rpcId = typeof body?.rpcId === "string" ? body.rpcId : "invalid-request";
			if (!body || body.type !== "client-request" || typeof body.method !== "string") {
				writeJson(res, 200, serverResponse(rpcId, {
					ok: false,
					error: { code: "gateway/bad-request", message: "invalid client-request message", details: { issues: [] } }
				}));
				return;
			}
			if (body.method !== endpoint) {
				writeJson(res, 200, serverResponse(rpcId, {
					ok: false,
					error: {
						code: "gateway/bad-request",
						message: `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
						details: { issues: [] }
					}
				}));
				return;
			}

			const result = await invoke(getCached(), endpoint, body.payload, undefined);
			if (result.config) setCached(result.config);
			if (!result.ok && result.error?.code === "desktop-bridge/unavailable") {
				const refreshed = await configFromEndpointFile();
				const cached = getCached();
				if (refreshed && (refreshed.base !== cached?.base || refreshed.token !== cached?.token)) {
					setCached(refreshed);
					const retry = await invoke(refreshed, endpoint, body.payload, undefined);
					if (retry.config) setCached(retry.config);
					writeJson(res, 200, serverResponse(rpcId, { ok: retry.ok, value: retry.value, error: retry.error }));
					return;
				}
			}
			writeJson(res, 200, serverResponse(rpcId, { ok: result.ok, value: result.value, error: result.error }));
		} catch (error) {
			const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			if (!res.headersSent) {
				// Prefer Cordis-style 200 + ok:false so the Chat UI shows the real message
				// instead of opaque "HTTP 500".
				writeJson(res, 200, serverResponse(rpcId, {
					ok: false,
					error: { code: "desktop-bridge/handler-failure", message, details: {} }
				}));
			} else {
				res.destroy();
			}
		}
	};
}

function apply(ctx) {
	let cached = configFromEnv();
	trayConfigGetter = () => cached;
	ctx.inject(["connection", "webServer"], (rpcCtx) => {
		const handler = createRouteHandler(
			rpcCtx.connection,
			() => cached,
			(next) => {
				cached = next;
			}
		);
		rpcCtx.effect(() => {
			const unregister = rpcCtx.webServer.register({
				kind: "prefix",
				path: channel,
				handler
			});
			return unregister;
		}, "desktop-bridge: /desktop-bridge rpc prefix");
	});
	// Turn-end failures never appear on SessionSummary; sticky them here for the tray.
	ctx.inject(["sessions"], (sctx) => {
		sctx.on("session/event", (session, event) => {
			if (!event || event.type !== "turn/end") return;
			const kind = event.data?.reason?.kind;
			if (kind !== "error" && kind !== "interrupted") return;
			const id = session?.id || session?.header?.id;
			if (markStickySessionError(id)) scheduleTraySessionsRepublish();
		});
		sctx.on("api-session/error", (sessionId) => {
			if (markStickySessionError(sessionId)) scheduleTraySessionsRepublish();
		});
		sctx.on("api-session/status", (sessionId, running) => {
			if (running && clearStickySessionError(sessionId)) scheduleTraySessionsRepublish();
		});
	});
}

export { apply, inject, name };
