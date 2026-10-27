import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
  assert.doesNotMatch(files.patch, /toolCallTimeoutMs:/);
  assert.doesNotMatch(files.patch, /shell/);
  assert.equal(files.packageName, "@local/dsh-mcp-files");
  assert.equal(files.rowId, "dsh-mcp-files");
  assert.equal(model.bundleFiles({ serverName: "files", command: "x" }, null, "Ab-9").rowId, "dsh-mcp-files-ab9");
  assert.equal(model.bundleFiles({ serverName: "files", command: "x" }, null, "n", "dsh-mcp-files-keep").rowId, "dsh-mcp-files-keep");
  const pkg = JSON.parse(files.packageJson);
  assert.equal(pkg.name, "@local/dsh-mcp-files");
  assert.equal(pkg.description, "MCP server (files · stdio)");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
});

test("enabled bundle omits disabled flag, writes custom toolCallTimeoutMs, and streamable-http writes url/headers", () => {
  const files = model.bundleFiles({
    serverName: "remote",
    transport: "streamable-http",
    enabled: true,
    url: "https://example.test/mcp",
    headers: [{ name: "Authorization", ref: "MCP_TOKEN" }],
    toolCallTimeoutMs: 120000,
  });
  assert.doesNotMatch(files.patch, /disabled:/);
  assert.match(files.patch, /transport: "streamable-http"/);
  assert.match(files.patch, /url: "https:\/\/example\.test\/mcp"/);
  assert.match(files.patch, /Authorization: !!js process\.env\.MCP_TOKEN/);
  assert.match(files.patch, /toolCallTimeoutMs: 120000/);
  assert.throws(() => model.bundleFiles({ serverName: "remote", command: "x", toolCallTimeoutMs: -5 }), /toolCallTimeoutMs/);
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

test("8 locales share exactly the same keys and placeholders, and package locale/*.json meta is synced", () => {
  const dir = join(root, "lib/locales");
  const pkgLocaleDir = join(root, "locale");
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
    const pkgMeta = JSON.parse(readFileSync(join(pkgLocaleDir, lang + ".json"), "utf8"));
    assert.equal(pkgMeta.meta.title, dict.title, lang + " meta.title");
    assert.equal(pkgMeta.meta.description, dict.description, lang + " meta.description");
  }
  for (const code of ["externalDelete", "renameOwned", "editDisabled", "placeholder", "badRequest"]) assert.ok(en["error." + code], code);
  for (const code of ["empty", "connected", "failed", "disabled", "unknown"]) assert.ok(en["status." + code], code);
});

test("package.json and icon.svg follow DSH 0.2.1+ manifest and artwork conventions", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.engines?.dsh, ">=0.2.0-rc.1");
  assert.equal(pkg.exports?.["./locale/*.json"], "./locale/*.json");
  assert.ok(pkg.files?.includes("locale/"));
  assert.ok(pkg.files?.includes("icon.svg"));
  const iconPath = join(root, "icon.svg");
  const iconStat = statSync(iconPath);
  assert.ok(iconStat.size > 0 && iconStat.size < 256 * 1024);
  const svg = readFileSync(iconPath, "utf8");
  assert.match(svg, /viewBox="0 0 36 36"/);
  assert.match(svg, /linearGradient/);
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

test("maskUrl and redactText hide query, fragment, userinfo, bearer tokens, and secret assignments", () => {
  assert.equal(model.maskUrl("https://h.test/mcp?key=abc"), "https://h.test/mcp?…");
  assert.equal(model.maskUrl("https://u:p@h.test/mcp#t"), "https://…@h.test/mcp?…");
  assert.equal(model.maskUrl("http://127.0.0.1:1/mcp"), "http://127.0.0.1:1/mcp");
  const redacted = model.redactText("Failed https://u:pass@example.com/mcp?api_key=12345 with Bearer my-secret-jwt and API_TOKEN=xyz987");
  assert.doesNotMatch(redacted, /pass|12345|my-secret-jwt|xyz987/);
  assert.match(redacted, /\?\[credentials-redacted\]/);
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

test("Host exposes authenticated fetch routes, scans schemas once per snapshot, and supports reconnect & redacted lastError", async () => {
  const host = readFileSync(join(root, "lib/index.js"), "utf8");
  assert.match(host, /connection\.fetch\.register/);
  assert.match(host, /export const Config = z\.object\(\{\}\)/);
  assert.match(host, /forceEnabled\(ctx, rowId/);
  const mod = await import("../lib/index.js");
  assert.equal(mod.STATE_PATH, "/api/dsh-mcp-manager/state");
  assert.equal(mod.ACTION_PATH, "/api/dsh-mcp-manager/action");
  assert.ok(mod.inject.includes("connection"));

  const routes = new Map();
  let schemaCalls = 0;
  let alphaPhase = "failed";
  const toggleCalls = [];
  const ctx = {
    configEditor: {
      documentPath: "/tmp/fake-profile/cordis.patch.yml",
      entries: () => [
        {
          options: {
            id: "dsh-mcp-alpha-1",
            name: model.MCP_CLIENT,
            config: { serverName: "alpha", transport: "streamable-http", url: "https://example.test/mcp?secret=1" },
          },
          disabled: false,
        },
        {
          options: {
            id: "dsh-mcp-beta-2",
            name: model.MCP_CLIENT,
            config: { serverName: "beta", transport: "stdio", command: "node", args: ["b.js"] },
          },
          disabled: false,
        },
      ],
    },
    pluginManager: {
      listPlugins: async () => [
        { patchId: "dsh-mcp-alpha-1", entryId: "entry-alpha", moduleName: model.MCP_CLIENT, enabled: true, fiberPhase: alphaPhase },
        { patchId: "dsh-mcp-beta-2", entryId: "entry-beta", moduleName: model.MCP_CLIENT, enabled: true, fiberPhase: "active" },
      ],
      listBundles: async () => [
        { name: "@local/dsh-mcp-alpha" },
        { name: "@local/dsh-mcp-beta" },
      ],
      setPluginEnabled: async (entryId, enabled) => {
        toggleCalls.push([entryId, enabled]);
        if (entryId === "entry-alpha" && enabled && alphaPhase === "failed") {
          return { application: "failed", error: { diagnostic: "Connect failed to https://u:pw@example.test/mcp?token=topsecret with Bearer abc123xyz" } };
        }
        return { application: "applied" };
      },
    },
    tools: {
      schemas: () => {
        schemaCalls += 1;
        return [
          { name: "mcp__beta__echo", description: "Echoes input text" },
          { name: "mcp__beta__add", description: "Adds two numbers" },
          { name: "bash", description: "Run shell" },
        ];
      },
    },
    workspaceRegistry: {
      list: () => [],
    },
    connection: {
      fetch: {
        register: (spec) => {
          routes.set(spec.path, spec.fetch);
          return () => routes.delete(spec.path);
        },
      },
    },
    inject: (_deps, fn) => fn({ workspaceRegistry: ctx.workspaceRegistry }),
    effect: (fn) => fn(),
  };

  mod.apply(ctx);
  assert.equal(routes.size, 2);

  // 1) Initial state scan: 2 enabled servers -> schemas() called only ONCE
  const stateRes1 = await routes.get(mod.STATE_PATH)();
  const state1 = await stateRes1.json();
  assert.equal(schemaCalls, 1);
  const beta = state1.servers.find((s) => s.serverName === "beta");
  assert.deepEqual(beta.tools, ["add", "echo"]);
  assert.equal(beta.toolDetails.length, 2);
  assert.equal(beta.toolDetails[0].publicName, "mcp__beta__add");

  // 2) Failing reconnect records redacted lastError on alpha
  const failRes = await routes.get(mod.ACTION_PATH)(
    new Request("http://localhost" + mod.ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "reconnect", patchId: "dsh-mcp-alpha-1", serverName: "alpha", pluginEntryId: "entry-alpha" }),
    })
  );
  const failBody = await failRes.json();
  assert.equal(failBody.ok, false);
  assert.doesNotMatch(failBody.message, /topsecret|abc123xyz|pw/);
  const alphaFailed = failBody.state.servers.find((s) => s.serverName === "alpha");
  assert.ok(alphaFailed.lastError.includes("?[credentials-redacted]"));
  assert.doesNotMatch(alphaFailed.lastError, /topsecret|abc123xyz|pw/);

  // 3) Successful reconnect cycles false -> true and clears lastError
  alphaPhase = "active";
  toggleCalls.length = 0;
  const okRes = await routes.get(mod.ACTION_PATH)(
    new Request("http://localhost" + mod.ACTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "reconnect", patchId: "dsh-mcp-alpha-1", serverName: "alpha", pluginEntryId: "entry-alpha" }),
    })
  );
  const okBody = await okRes.json();
  assert.equal(okBody.ok, true);
  assert.equal(okBody.notice, "reconnected");
  assert.deepEqual(toggleCalls, [["entry-alpha", false], ["entry-alpha", true]]);
  const alphaRecovered = okBody.state.servers.find((s) => s.serverName === "alpha");
  assert.equal(alphaRecovered.lastError, "");
});

test("Client UI hides empty project workspaces on main view and shows workspace context in import, row badge, and stdio confirm", async () => {
  let registeredPage = null;
  let statePayload = {
    servers: [
      {
        patchId: "dsh-mcp-alpha-1",
        bundleName: "@local/dsh-mcp-alpha",
        pluginEntryId: "entry-alpha",
        serverName: "alpha",
        enabled: false,
        status: "disabled",
        transport: "stdio",
        command: "npx",
        args: ["-y", "pkg"],
        cwd: "/ws/app",
        env: [],
        headers: [],
        tools: [],
        toolDetails: [],
      },
    ],
    project: [
      {
        workspaceId: "ws-empty-1",
        title: "dsh-sol-pi",
        path: "/ws/dsh-sol-pi",
        files: [
          { file: ".dsh/mcp.json", present: false, error: null, rows: [] },
          { file: ".dsh/mcp.local.json", present: false, error: null, rows: [] },
        ],
      },
      {
        workspaceId: "ws-app",
        title: "my-app",
        path: "/ws/app",
        files: [
          { file: ".dsh/mcp.json", present: false, error: null, rows: [] },
          { file: ".dsh/mcp.local.json", present: false, error: null, rows: [] },
        ],
      },
    ],
  };

  // Minimal hook-capable React stub for synchronous tree inspection
  const states = [];
  let cursor = 0;
  const FakeReact = {
    Fragment: Symbol.for("react.fragment"),
    useState(init) {
      const idx = cursor++;
      if (!(idx in states)) states[idx] = typeof init === "function" ? init() : init;
      const set = (next) => {
        states[idx] = typeof next === "function" ? next(states[idx]) : next;
      };
      return [states[idx], set];
    },
    useEffect() {},
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useRef(init) {
      return { current: init };
    },
  };
  const jsxRuntime = {
    jsx: (type, props, key) => ({ type, props: props || {}, key }),
    jsxs: (type, props, key) => ({ type, props: props || {}, key }),
  };

  function expand(node) {
    if (node == null || typeof node === "boolean") return null;
    if (Array.isArray(node)) return node.map(expand).filter(Boolean);
    if (typeof node !== "object") return node;
    if (typeof node.type === "function") {
      return expand(node.type(node.props || {}));
    }
    const nextProps = { ...node.props };
    if ("children" in nextProps) {
      nextProps.children = expand(nextProps.children);
    }
    return { ...node, props: nextProps };
  }

  function findAll(node, pred, acc = []) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const item of node) findAll(item, pred, acc);
      return acc;
    }
    if (pred(node)) acc.push(node);
    if (node.props?.children) findAll(node.props.children, pred, acc);
    return acc;
  }

  const prevWindow = globalThis.window;
  let loadedDef = null;
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    __ModuleLoader__: {
      load(def) {
        loadedDef = def;
      },
    },
  };
  try {
    const clientCode = readFileSync(join(root, "lib/client.js"), "utf8");
    new Function(clientCode)();
    assert.ok(loadedDef);
    const clientMod = loadedDef.factory((id) => {
      if (id === "react") return FakeReact;
      if (id === "react/jsx-runtime") return jsxRuntime;
      return {};
    });
    let registeredMainPage = null;
    let sidebarRegistration = null;
    clientMod.apply({
      effect: (fn) => fn(),
      locale: { register() {} },
      slots: {
        inject: (_slot, fn) => fn(),
        register: (meta, Comp) => {
          if (meta?.name === "plugins.bundle.config") registeredPage = Comp;
          if (meta?.name === "main" && meta?.key === "dsh-mcp-manager") registeredMainPage = Comp;
          if (meta?.name === "sidebar.panellist" && meta?.id === "dsh-mcp-manager") {
            sidebarRegistration = { meta, Comp };
            return () => {
              sidebarRegistration = null;
            };
          }
          return () => {};
        },
      },
    });
    assert.equal(typeof registeredPage, "function");
    assert.equal(typeof registeredMainPage, "function");
    assert.ok(sidebarRegistration, "sidebar.panellist entry must be registered by default");
    assert.equal(sidebarRegistration.meta.order, 15);

    // Pre-populate state slot (index 0 in Manager: [state, setState])
    states[0] = statePayload;
    cursor = 0;
    const tree1 = expand(registeredPage({ t: (k) => k }));

    // Sidebar toggle row is rendered at the top of the plugin settings page
    const sidebarPrefRow = findAll(tree1, (n) => n.props && "data-sidebar-pref" in n.props);
    assert.equal(sidebarPrefRow.length, 1);
    const sidebarToggleSwitch = findAll(sidebarPrefRow[0], (n) => n.props?.role === "switch")[0];
    assert.ok(sidebarToggleSwitch);
    assert.equal(sidebarToggleSwitch.props["aria-checked"], "true");

    // Toggling off unregisters sidebar.panellist immediately; toggling on re-registers it
    sidebarToggleSwitch.props.onClick();
    assert.equal(sidebarRegistration, null, "disabling sidebar toggle must unregister sidebar.panellist");
    cursor = 0;
    const treeSidebarOff = expand(registeredPage({ t: (k) => k }));
    const sidebarToggleSwitchOff = findAll(findAll(treeSidebarOff, (n) => n.props && "data-sidebar-pref" in n.props)[0], (n) => n.props?.role === "switch")[0];
    sidebarToggleSwitchOff.props.onClick();
    assert.ok(sidebarRegistration, "re-enabling sidebar toggle must re-register sidebar.panellist");

    // 1) Main view does NOT render [data-project] when no workspace has .dsh/mcp*.json
    assert.equal(findAll(tree1, (n) => n.props && "data-project" in n.props).length, 0);

    // 2) ServerRow shows matched workspace badge ("Project · my-app") via cwd match
    const badges = findAll(tree1, (n) => n.props?.className === "dsh-mcp-badge");
    assert.ok(badges.some((b) => String(b.props.children).includes("my-app")));

    // 3) Opening Import panel renders collapsible [data-project] inside Import
    const importBtn = findAll(tree1, (n) => n.type === "button" && Array.isArray(n.props?.children) && n.props.children.includes("Import"))[0];
    assert.ok(importBtn);
    importBtn.props.onClick();
    cursor = 0;
    const treeImport = expand(registeredPage({ t: (k) => k }));
    assert.equal(findAll(treeImport, (n) => n.props && "data-project" in n.props).length, 1);

    // Close Import and trigger stdio enable confirmation -> shows [data-confirm-project="my-app"]
    const cancelBtn = findAll(treeImport, (n) => n.type === "button" && n.props?.children === "Cancel")[0];
    assert.ok(cancelBtn);
    cancelBtn.props.onClick();
    const serverRowNode = findAll(tree1, (n) => n.props?.["data-server"] === "alpha")[0];
    const switchBtn = findAll(serverRowNode, (n) => n.props?.role === "switch")[0];
    assert.ok(switchBtn);
    switchBtn.props.onClick();
    cursor = 0;
    const treeConfirm = expand(registeredPage({ t: (k) => k }));
    const confirmProj = findAll(treeConfirm, (n) => n.props?.["data-confirm-project"] === "my-app");
    assert.equal(confirmProj.length, 1);
  } finally {
    globalThis.window = prevWindow;
  }
});

