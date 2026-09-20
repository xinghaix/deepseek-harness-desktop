/** Parse and match web_fetch allowlist entries (one domain or URL per line). */

const COMMENT = /^\s*#/;

export function parseHostLine(raw) {
  const line = String(raw ?? "").trim();
  if (line.length === 0 || COMMENT.test(line)) return null;
  let value = line;
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  } else if (value.includes("/") && !value.startsWith("*")) {
    try {
      value = new URL(`https://${value}`).hostname;
    } catch {
      value = value.split("/")[0] ?? value;
    }
  }
  value = value.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (value.length === 0) return null;
  return value;
}

export function parseHostsText(text) {
  const seen = new Set();
  const hosts = [];
  for (const raw of String(text ?? "").split(/\r?\n/u)) {
    const host = parseHostLine(raw);
    if (host === null || seen.has(host)) continue;
    seen.add(host);
    hosts.push(host);
  }
  return hosts;
}

export function hostsToRows(text) {
  const hosts = parseHostsText(text);
  return hosts.length > 0 ? hosts : [""];
}

export function rowsToHostsText(rows) {
  const seen = new Set();
  const lines = [];
  for (const row of rows) {
    const host = parseHostLine(row);
    if (host === null || seen.has(host)) continue;
    seen.add(host);
    lines.push(host);
  }
  return lines.join("\n");
}

/** `*.example.com` and bare `example.com` both match the name and any subdomain. */
export function hostMatches(hostname, allowlist) {
  const host = String(hostname ?? "")
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (host.length === 0 || allowlist.length === 0) return false;
  for (const entry of allowlist) {
    const pattern = entry.startsWith("*.") ? entry.slice(2) : entry;
    if (pattern.length === 0) continue;
    if (host === pattern || host.endsWith(`.${pattern}`)) return true;
  }
  return false;
}
