import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const model = require("../lib/model.cjs");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("rejects an illegal or duplicate serverName", () => {
  assert.equal(model.nameIssue("", []), "empty");
  assert.equal(model.nameIssue("bad name", []), "invalid");
  assert.equal(model.nameIssue("github", ["github"]), "taken");
  assert.equal(model.nameIssue("github", ["github"], "github"), "");
  assert.match(model.nameMessage("taken", "github"), /github/);
});

test("keeps stdio args as separate argv elements", () => {
  const files = model.bundleFiles({
    serverName: "files",
    transport: "stdio",
    enabled: false,
    command: "npx",
    args: ["-y", "server", "/Users/xing/My Documents"],
    env: [{ name: "TOKEN", ref: "FILES_TOKEN" }],
  });
  assert.match(files.patch, /disabled: true/);
  assert.doesNotMatch(files.patch, /ctx\.plugin/);
  assert.match(files.patch, /\n          - "-y"\n          - "server"\n          - "\/Users\/xing\/My Documents"/);
  assert.match(files.patch, /TOKEN: !!js process\.env\.FILES_TOKEN/);
  assert.doesNotMatch(files.patch, /shell/);
  assert.equal(files.packageName, "@local/dsh-mcp-files");
  assert.equal(files.rowId, "dsh-mcp-files");
  assert.equal(model.bundleFiles({ serverName: "files", command: "x" }, null, "Ab-9").rowId, "dsh-mcp-files-ab9");
  assert.equal(model.bundleFiles({ serverName: "files", command: "x" }, null, "n", "dsh-mcp-files-keep").rowId, "dsh-mcp-files-keep");
  const pkg = JSON.parse(files.packageJson);
  assert.equal(pkg.name, "@local/dsh-mcp-files");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
});

test("enabled bundle omits disabled flag and streamable-http writes url/headers", () => {
  const files = model.bundleFiles({
    serverName: "remote",
    transport: "streamable-http",
    enabled: true,
    url: "https://example.test/mcp",
    headers: [{ name: "Authorization", ref: "MCP_TOKEN" }],
  });
  assert.doesNotMatch(files.patch, /disabled:/);
  assert.match(files.patch, /transport: "streamable-http"/);
  assert.match(files.patch, /url: "https:\/\/example.test\/mcp"/);
  assert.match(files.patch, /Authorization: !!js process\.env\.MCP_TOKEN/);
});

test("import drops sse, ws, oauth, unknown types and a bare url", () => {
  const parsed = model.parseImport(JSON.stringify({
    mcpServers: {
      files: { command: "npx", args: ["server"], env: { TOKEN: "super-secret" }, envFile: ".env" },
      brave: { type: "http", url: "https://example.test/mcp", headers: { Authorization: "Bearer secret" } },
      legacy: { type: "sse", url: "https://example.test/sse" },
      socket: { type: "ws", url: "ws://example.test" },
      custom: { type: "ws1", url: "https://example.test/custom" },
      bare: { url: "https://example.test/only" },
      notion: { command: "npx", oauth: { clientId: "x" } },
      github: { command: "npx" },
    },
  }), ["github"]);
  assert.equal(parsed.error, "");
  const byName = Object.fromEntries(parsed.rows.map((row) => [row.name, row]));
  assert.equal(byName.files.skip, false);
  assert.equal(byName.brave.skip, false);
  assert.equal(byName.brave.server.transport, "streamable-http");
  assert.equal(byName.files.server.enabled, false);
  assert.match(byName.legacy.text, /SSE/);
  assert.match(byName.socket.text, /WebSocket/);
  assert.match(byName.custom.text, /不支持这种传输/);
  assert.match(byName.bare.text, /没有可识别的 type/);
  assert.match(byName.notion.text, /OAuth/);
  assert.match(byName.github.text, /不会重复添加/);
  const preview = model.previewText(parsed);
  assert.doesNotMatch(preview, /super-secret/);
  assert.doesNotMatch(preview, /Bearer secret/);
  assert.equal(byName.files.server.env[0].value, "super-secret");
});

test("secretView never returns secret values and mergeSecrets preserves js refs", () => {
  const merged = model.mergeSecrets({
    TOKEN: { __jsExpr: "process.env.TOKEN" },
    OLD: "keep-me-out",
  }, [
    { name: "TOKEN", keep: true },
    { name: "NEW", ref: "NEW_TOKEN" },
  ]);
  assert.deepEqual(merged, {
    TOKEN: { __jsExpr: "process.env.TOKEN" },
    NEW: { __jsExpr: "process.env.NEW_TOKEN" },
  });
  assert.deepEqual(model.secretView(merged), [
    { name: "TOKEN", set: true, ref: "TOKEN" },
    { name: "NEW", set: true, ref: "NEW_TOKEN" },
  ]);
  assert.deepEqual(model.secretView({ KEY: "literal-secret" }), [
    { name: "KEY", set: true, ref: "" },
  ]);
});

test("client.js inlines model.cjs and every locale inside the main factory", () => {
  const client = readFileSync(join(root, "lib/client.js"), "utf8");
  const source = readFileSync(join(root, "lib/model.cjs"), "utf8").trim();
  assert.match(client, /BEGIN EMBEDDED MODEL/);
  assert.match(client, /BEGIN EMBEDDED LOCALES/);
  assert.ok(client.includes(source), "client embed must match model.cjs byte-for-byte");
  // a second ModuleLoader id breaks live profile reloads ("duplicate factory registration")
  assert.doesNotMatch(client, /id: "dsh-mcp-manager\/model"/);
  assert.doesNotMatch(client, /require\("dsh-mcp-manager\/model"\)/);
  assert.equal((client.match(/__ModuleLoader__\.load\(/g) || []).length, 1);
  execFileSync(process.execPath, [join(root, "scripts/embed-model.mjs"), "--check"], { cwd: root });
});

test("8 locales share exactly the same keys and placeholders", () => {
  const dir = join(root, "lib/locales");
  const langs = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(langs, ["de", "en", "es", "fr", "ja", "ko", "pt", "zh"]);
  const en = JSON.parse(readFileSync(join(dir, "en.json"), "utf8"));
  const params = (text) => (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join(",");
  for (const lang of langs) {
    const dict = JSON.parse(readFileSync(join(dir, lang + ".json"), "utf8"));
    assert.deepEqual(Object.keys(dict).sort(), Object.keys(en).sort(), lang + " keys");
    for (const key of Object.keys(en)) {
      assert.ok(String(dict[key]).trim(), lang + " " + key + " empty");
      assert.equal(params(dict[key]), params(en[key]), lang + " " + key + " placeholders");
    }
  }
  for (const code of ["externalDelete", "renameOwned", "editDisabled", "placeholder", "badRequest"]) assert.ok(en["error." + code], code);
  for (const code of ["empty", "connected", "failed", "disabled", "unknown"]) assert.ok(en["status." + code], code);
});

test("statusOf derives the row status", () => {
  assert.equal(model.statusOf({ enabled: false, fiberPhase: "active", toolCount: 3 }), "disabled");
  assert.equal(model.statusOf({ enabled: true, fiberPhase: "failed", toolCount: 0 }), "failed");
  assert.equal(model.statusOf({ enabled: true, fiberPhase: "active", toolCount: 2 }), "connected");
  assert.equal(model.statusOf({ enabled: true, fiberPhase: "active", toolCount: 0 }), "empty");
  assert.equal(model.statusOf({ enabled: true, fiberPhase: "loading", toolCount: 0 }), "unknown");
});

test("launchChanged only fires for a new or changed stdio launch", () => {
  const base = { transport: "stdio", command: "node", args: ["a"], cwd: "" };
  assert.equal(model.launchChanged(null, base), true);
  assert.equal(model.launchChanged(base, { ...base }), false);
  assert.equal(model.launchChanged(base, { ...base, args: ["a", "b"] }), true);
  assert.equal(model.launchChanged(base, { ...base, cwd: "/tmp" }), true);
  assert.equal(model.launchChanged(base, { transport: "streamable-http", url: "http://x" }), false);
  assert.equal(model.launchChanged({ transport: "streamable-http" }, base), true);
});

test("maskUrl hides query, fragment and userinfo", () => {
  assert.equal(model.maskUrl("https://h.test/mcp?key=abc"), "https://h.test/mcp?…");
  assert.equal(model.maskUrl("https://u:p@h.test/mcp#t"), "https://…@h.test/mcp?…");
  assert.equal(model.maskUrl("http://127.0.0.1:1/mcp"), "http://127.0.0.1:1/mcp");
});

test("templates only fill a disabled draft and keep placeholders blocking", () => {
  const ids = model.TEMPLATES.map((t) => t.id);
  assert.ok(ids.includes("filesystem") && ids.includes("github"));
  for (const id of ids) {
    const draft = model.templateDraft(id);
    assert.equal(draft.enabled, false, id);
    assert.equal(draft.patchId, "", id);
    for (const row of [...draft.env, ...draft.headers]) assert.equal(row.value, "", id + " must not carry a secret value");
  }
  const fs = model.templateDraft("filesystem");
  assert.equal(fs.transport, "stdio");
  assert.ok(model.hasPlaceholder(fs), "filesystem needs a directory first");
  const gh = model.templateDraft("github");
  assert.equal(gh.transport, "streamable-http");
  assert.equal(gh.headers[0].ref, "GITHUB_MCP_AUTHORIZATION");
  assert.equal(model.templateDraft("nope"), null);
  assert.equal(model.hasPlaceholder({ command: "node", args: ["x.mjs"] }), false);
});

test("projectPending reads both files, skips duplicates and existing names", () => {
  const files = [
    { file: ".dsh/mcp.json", text: JSON.stringify({ mcpServers: { a: { command: "node" }, b: { type: "sse", url: "http://x/sse" } } }) },
    { file: ".dsh/mcp.local.json", text: JSON.stringify({ mcpServers: { a: { command: "other" }, c: { url: "http://x/mcp", type: "http" }, d: { command: "node" } } }) },
  ];
  const out = model.projectPending(files, ["d"]);
  assert.equal(out.length, 2);
  const rows = Object.fromEntries(out.flatMap((f) => f.rows.map((r) => [f.file + ":" + r.name, r])));
  assert.equal(rows[".dsh/mcp.json:a"].skip, false);
  assert.equal(rows[".dsh/mcp.json:b"].code, "sse");
  assert.equal(rows[".dsh/mcp.local.json:a"].code, "existing");
  assert.equal(rows[".dsh/mcp.local.json:c"].skip, false);
  assert.equal(rows[".dsh/mcp.local.json:d"].code, "existing");
  const missing = model.projectPending([{ file: ".dsh/mcp.json", text: null }, { file: ".dsh/mcp.local.json", text: "{bad" }], []);
  assert.deepEqual(missing[0], { file: ".dsh/mcp.json", present: false, error: "", rows: [] });
  assert.equal(missing[1].error, "json");
  assert.deepEqual(model.projectPending([], []), []);
});

test("rows sent to the page carry no secret values", () => {
  const parsed = model.parseImport(JSON.stringify({
    mcpServers: {
      s: { command: "node", env: { TOKEN: "lit-value-1", REF: "${MY_REF}" } },
      h: { type: "http", url: "https://h.test/mcp?k=lit-value-2", headers: { Authorization: "Bearer lit-value-3" } },
    },
  }), []);
  const text = JSON.stringify(model.publicRows(parsed)) + model.previewText(parsed);
  assert.doesNotMatch(text, /lit-value/);
  const s = model.publicRows(parsed).find((r) => r.name === "s");
  assert.deepEqual(s.masked.env.find((r) => r.name === "REF"), { name: "REF", set: true, ref: "MY_REF" });
});

test("bundleSecrets reads back what bundleFiles wrote, keep keeps refs as refs", () => {
  const files = model.bundleFiles({
    serverName: "k",
    command: "node",
    env: [{ name: "A", ref: "A_REF" }, { name: "B", value: 'q"uote' }, { name: "x-y", value: "v" }],
  });
  const stored = model.bundleSecrets(files.patch);
  assert.deepEqual(stored.env, { A: { ref: "A_REF" }, B: { value: 'q"uote' }, "x-y": { value: "v" } });
  const rows = model.keepSecretRows(stored.env, [{ name: "A", keep: true }, { name: "B", value: "new" }, { name: "gone", keep: true }]);
  assert.deepEqual(rows, [{ name: "A", ref: "A_REF" }, { name: "B", value: "new" }]);
  const http = model.bundleFiles({ serverName: "h", transport: "streamable-http", url: "https://h.test/mcp", headers: [{ name: "Authorization", ref: "TOK" }] });
  assert.deepEqual(model.bundleSecrets(http.patch).headers, { Authorization: { ref: "TOK" } });
});

test("Host exposes authenticated fetch routes and keeps Config empty", async () => {
  const host = readFileSync(join(root, "lib/index.js"), "utf8");
  assert.match(host, /connection\.fetch\.register/);
  assert.match(host, /export const Config = z\.object\(\{\}\)/);
  assert.match(host, /forceEnabled\(ctx, rowId/);
  const mod = await import("../lib/index.js");
  assert.equal(mod.STATE_PATH, "/api/dsh-mcp-manager/state");
  assert.equal(mod.ACTION_PATH, "/api/dsh-mcp-manager/action");
  assert.ok(mod.inject.includes("connection"));
});
