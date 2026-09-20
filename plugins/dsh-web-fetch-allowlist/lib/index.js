import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import { hostMatches, parseHostsText } from "./hosts.js";

/** Cordis plugin name used by loader diagnostics. */
export const name = "web-fetch-allowlist";
/** Needs the web seam so it can wrap the native `http` fetch provider. */
export const inject = ["web"];
/** Settings namespace paired with the official Plugins card. */
export const SETTINGS_NS = "web-fetch-allowlist";

export const Config = z.object({
	hosts: z.string().default(""),
});

const blocked = new BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4");
blocked.addSubnet("127.0.0.0", 8, "ipv4");
blocked.addSubnet("169.254.0.0", 16, "ipv4");
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("224.0.0.0", 4, "ipv4");
blocked.addSubnet("240.0.0.0", 4, "ipv4");
blocked.addAddress("255.255.255.255", "ipv4");
blocked.addSubnet("::1", 128, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("ff00::", 8, "ipv6");

function stripIpv6Brackets(hostname) {
	return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function unwrapMappedIpv4(address) {
	return address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
}

/** RFC 2544 / Surge·Clash Fake-IP range. */
function isFakeIp(address) {
	const v4 = unwrapMappedIpv4(address);
	const parts = v4.split(".");
	if (parts.length !== 4) return false;
	const a = Number(parts[0]);
	const b = Number(parts[1]);
	return a === 198 && (b === 18 || b === 19);
}

function isAllowedResolvedAddress(address) {
	if (isFakeIp(address)) return true;
	const family = isIP(address);
	if (family === 0) return false;
	return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

async function resolveAllowlisted(hostname, signal) {
	const unbracketed = stripIpv6Brackets(hostname);
	const literalFamily = isIP(unbracketed);
	const resolved =
		literalFamily === 0
			? await lookup(unbracketed, { all: true, order: "verbatim" })
			: [{ address: unbracketed, family: literalFamily }];
	if (resolved.length === 0) {
		throw new WebError(`hostname "${hostname}" resolved to no addresses`, "WEB_PROVIDER_ERROR");
	}
	const addresses = [];
	for (const entry of resolved) {
		if (!isAllowedResolvedAddress(entry.address)) {
			throw new WebError(`URL hostname "${hostname}" resolves to a non-public IP address`, "WEB_BLOCKED_URL");
		}
		addresses.push({ address: entry.address, family: entry.family });
	}
	if (signal?.aborted) throw new WebError("web fetch aborted", "WEB_ABORTED");
	return addresses;
}

function wrapHttpProvider(provider, getAllowlist) {
	if (provider == null || provider.id !== "http" || provider.__dshFetchAllowlist) return;
	const original = provider.resolveAddresses.bind(provider);
	provider.resolveAddresses = (hostname, signal) => {
		if (!hostMatches(hostname, getAllowlist())) return original(hostname, signal);
		return resolveAllowlisted(hostname, signal);
	};
	provider.__dshFetchAllowlist = true;
}

export function apply(ctx, config) {
	let current = () => config;
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, SETTINGS_NS, Config, config, {
			setSource: (source) => {
				current = source;
			},
			onChange: () => {},
		});
	});

	const getAllowlist = () => parseHostsText(current().hosts ?? "");
	const wrap = (provider) => wrapHttpProvider(provider, getAllowlist);

	wrap(ctx.web.fetchProviders.get("http"));
	const origRegister = ctx.web.registerFetchProvider.bind(ctx.web);
	ctx.web.registerFetchProvider = (provider) => {
		const dispose = origRegister(provider);
		wrap(provider);
		return dispose;
	};
	ctx.effect(
		() => () => {
			ctx.web.registerFetchProvider = origRegister;
		},
		"web-fetch-allowlist: restore registerFetchProvider",
	);
}
