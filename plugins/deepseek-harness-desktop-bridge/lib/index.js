const name = "deepseek-harness-desktop-bridge";
const inject = ["connection"];
const channel = "/desktop-bridge";
const routes = Object.freeze({
	status: Object.freeze({ method: "GET", path: "/v1/status" }),
	restart: Object.freeze({ method: "POST", path: "/v1/restart" }),
	stop: Object.freeze({ method: "POST", path: "/v1/stop" }),
	openManagement: Object.freeze({ method: "POST", path: "/v1/open-management" })
});

function bridgeConfig() {
	const base = process.env.DSH_DESKTOP_BRIDGE_URL?.trim();
	const token = process.env.DSH_DESKTOP_BRIDGE_TOKEN?.trim();
	if (base === undefined || base === "" || token === undefined || token === "") return undefined;
	let url;
	try {
		url = new URL(base);
	} catch {
		return undefined;
	}
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username !== "" || url.password !== "" || (url.pathname !== "" && url.pathname !== "/") || url.search !== "" || url.hash !== "") return undefined;
	return { base: url.href.replace(/\/$/, ""), token };
}

async function invoke(config, endpoint, signal) {
	const route = routes[endpoint];
	if (route === undefined) return {
		ok: false,
		error: { code: "desktop-bridge/not-allowed", message: "桌面桥接不支持此操作", details: {} }
	};
	if (config === undefined) return {
		ok: false,
		error: { code: "desktop-bridge/unavailable", message: "桌面端控制面不可用；请从 Deepseek Harness Desktop 启动 DSH", details: {} }
	};
	try {
		const response = await fetch(config.base + route.path, {
			method: route.method,
			headers: { "X-DSH-Desktop-Bridge-Token": config.token },
			signal
		});
		if (!response.ok) return {
			ok: false,
			error: { code: "desktop-bridge/rejected", message: `桌面端拒绝了操作（HTTP ${response.status}）`, details: {} }
		};
		return { ok: true, value: await response.json() };
	} catch {
		return {
			ok: false,
			error: { code: "desktop-bridge/unavailable", message: "桌面端控制面暂时不可达", details: {} }
		};
	}
}

function apply(ctx) {
	const config = bridgeConfig();
	ctx.connection.rpc.handle(channel, (endpoint, _payload, signal) => invoke(config, endpoint, signal));
}

export { apply, inject, name };
