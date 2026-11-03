import assert from "node:assert/strict";
import {
  authCookieNameForHost,
  collectStaleAuthCookies,
  createLoopbackWebViewMiddleware,
  injectLoadBundle,
  stripComboPreloads,
} from "./index.js";

const combo = "/plugins/??@deepseek-ai/dsh-client-hmr/client.js,@deepseek-ai/dsh-api-gateway/client.js&rev=abc";
const table = [
  { kind: "script", placement: "head", text: "window.__ModuleLoader__={load(){}}" },
  { kind: "script-preload", src: combo },
  { kind: "script-src", placement: "head", src: combo },
  { kind: "global", name: "__DSH_BOOT__", value: { batches: [{ url: combo }] } },
];
injectLoadBundle(table);

assert.equal(table[0].kind, "script");
assert.match(table[0].text, /__DSH_TRANSPORT__/);
assert.match(table[0].text, /loadBundle/);
assert.match(table[0].text, /\(0, eval\)/);
assert.match(table[0].text, /loadParallel/);
assert.match(table[0].text, /err\.status !== 431/);
assert.match(table[0].text, /prefetchBootBatches/);
assert.match(table[0].text, /__DSH_DESKTOP_WRAP_SHORTCUTS_FACTORY__/);
assert.equal(table.some((row) => row.kind === "script-preload"), false);

const loaderAt = table.findIndex((row) => row.text && row.text.includes("__ModuleLoader__"));
const comboAt = table.findIndex((row) => row.kind === "script-src" && row.src === combo);
assert.ok(loaderAt > 0, "module loader stays after the transport hook");
assert.ok(comboAt > 0, "combo script-src stays after the transport hook");
assert.ok(0 < loaderAt && loaderAt < comboAt, "loadBundle is installed before the combo loader");

const html = [
  "<!doctype html><html><head>",
  '<link rel="preload" as="script" href="/plugins/??@deepseek-ai/dsh-client-hmr/client.js&amp;rev=abc">',
  '<script src="/plugins/??@deepseek-ai/dsh-client-hmr/client.js&amp;rev=abc"></script>',
  "</head><body></body></html>",
].join("");
const stripped = stripComboPreloads(html);
assert.equal(stripped.includes('rel="preload"'), false);
assert.equal(stripped.includes("<script src="), true);

globalThis.__ModuleLoader__ = {
  load(registration) {
    globalThis.__loaded = registration.id;
  },
};
(0, eval)("globalThis.__ModuleLoader__.load({id:'from-eval',factory:function(){return {}}})");
assert.equal(globalThis.__loaded, "from-eval");

// Verify that when __ModuleLoader__.create() replaces loader.load with a fresh
// live registration function (as dsh-client-modules does), the hook re-wraps
// the new loader.load and bridges @deepseek-ai/dsh-client-shortcuts even before
// desktop-bridge is evaluated.
{
  const registered = new Map();
  const pendingQueue = [];
  globalThis.window = globalThis;
  Object.defineProperty(globalThis, "navigator", {
    value: { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" },
    configurable: true,
    writable: true,
  });
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.HTMLScriptElement = function () {};
  globalThis.HTMLScriptElement.prototype = {};
  globalThis.__ModuleLoader__ = {
    mode: "queue",
    pendingQueue,
    load(reg) {
      pendingQueue.push(reg);
    },
    create() {
      this.mode = "live";
      // Overwrite load() just like dsh-client-modules/lib/client.js:698
      this.load = (reg) => {
        registered.set(reg.id, reg.factory);
      };
      for (const reg of pendingQueue.splice(0)) {
        this.load(reg);
      }
    },
  };
  (0, eval)(table[0].text);
  // Queue-mode create() runs and replaces __ModuleLoader__.load:
  globalThis.__ModuleLoader__.create();
  // Now application batch registers @deepseek-ai/dsh-client-shortcuts:
  globalThis.__ModuleLoader__.load({
    id: "@deepseek-ai/dsh-client-shortcuts",
    factory() {
      class ShortcutsService {
        constructor(ctx) {
          this.ctx = ctx;
          this.runtime = globalThis.document.documentElement.dataset.platform ? "desktop" : "web";
          this.hasBridge = Boolean(globalThis.window.dshDesktop?.shortcuts && globalThis.window.dshDesktop?.keyboard);
          this.registered = new Map();
        }
        register(cmd) {
          if (cmd.defaults?.["desktop:linux"]) {
            throw new Error("Reserved shortcut default: " + cmd.id);
          }
          this.registered.set(cmd.id, cmd);
          return () => {
            this.registered.delete(cmd.id);
          };
        }
      }
      // dsh-client-shortcuts/lib/client.js:2613 exports ShortcutsService directly (typeof mod === "function")
      return ShortcutsService;
    },
  });
  globalThis.__ModuleLoader__.load({
    id: "@deepseek-ai/dsh-client-ui-shortcuts",
    factory() {
      const coreActionOrder = new Map(
        Array.from({ length: 20 }, (_, i) => [
          i === 0 ? "shortcuts.open" : i === 19 ? "page.close" : `cmd.${i}`,
          i,
        ]),
      );
      return { coreActionOrder };
    },
  });
  const mod = registered.get("@deepseek-ai/dsh-client-shortcuts")(() => ({}));
  assert.equal(typeof mod, "function", "wrapped factory must return constructor function when module.exports = ShortcutsService");
  const svc = new mod({ locale: { getSnapshot: () => ({ active: "zh" }) } });
  assert.equal(svc.runtime, "desktop", "ShortcutsService must initialize in desktop mode after create() replaces load()");
  assert.equal(svc.hasBridge, true, "window.dshDesktop proxy must be present during constructor");
  assert.equal(globalThis.document.documentElement.dataset.platform, undefined, "dataset.platform must be cleaned up after constructor");
  assert.equal(globalThis.window.dshDesktop, undefined, "window.dshDesktop must be cleaned up after constructor");
  assert.equal(svc.registered.get("desktop.quit")?.label(), "退出", "boot constructor must register desktop.quit with Chinese label from LocaleSnapshot.active");
  assert.equal(svc.registered.get("desktop.hide")?.label(), "隐藏应用", "boot constructor must register desktop.hide on macOS");
  assert.equal(svc.registered.get("desktop.hideOthers")?.label(), "隐藏其他", "boot constructor must register desktop.hideOthers on macOS");
  const uiMod = registered.get("@deepseek-ai/dsh-client-ui-shortcuts")(() => ({}));
  assert.equal(uiMod.coreActionOrder.get("settings.open"), 0.1, "settings.open must sort right after shortcuts.open");
  assert.equal(uiMod.coreActionOrder.get("page.close"), 0.2, "page.close must sort right after settings.open");
  assert.equal(uiMod.coreActionOrder.get("desktop.quit"), 0.3, "desktop.quit must sort in top viewport");
  assert.equal(uiMod.coreActionOrder.get("desktop.hide"), 0.4, "desktop.hide must sort in top viewport");
  assert.equal(uiMod.coreActionOrder.get("desktop.hideOthers"), 0.5, "desktop.hideOthers must sort in top viewport");
  assert.doesNotThrow(() => {
    svc.register({
      id: "desktop.quit",
      defaults: { "desktop:linux": { code: "KeyQ", modifiers: ["primary"] } },
    });
  });
}

// 验证历史过期端口 dsh-auth-* Cookie 自动清理，同时保持当前有效 Cookie 的 SameSite=Strict 与签名寿命不变
{
  const currentName = authCookieNameForHost("127.0.0.1:61419");
  const oldPortName1 = authCookieNameForHost("127.0.0.1:54523");
  const oldPortName2 = authCookieNameForHost("127.0.0.1:51000");
  assert.match(currentName, /^dsh-auth-[A-Za-z0-9_-]+$/);
  assert.notEqual(currentName, oldPortName1);

  const stale = collectStaleAuthCookies(
    `${oldPortName1}=v1.1.a; other_cookie=keep; ${currentName}=v1.2.b; ${oldPortName2}=v1.3.c`,
    currentName,
  );
  assert.equal(stale.length, 2, "must only expire stale dsh-auth-* cookies from previous ports");
  assert.ok(stale[0].startsWith(`${oldPortName1}=; Max-Age=0;`));
  assert.ok(stale[0].includes("SameSite=Strict"));
  assert.ok(stale[1].startsWith(`${oldPortName2}=; Max-Age=0;`));

  const mw = createLoopbackWebViewMiddleware();
  let capturedStatus = 0;
  let capturedHeaders = null;
  const req303 = {
    method: "GET",
    url: "/?token=launch-secret",
    headers: {
      host: "127.0.0.1:61419",
      cookie: `${oldPortName1}=v1.1.a; ${oldPortName2}=v1.3.c`,
    },
  };
  const res303 = {
    writeHead(status, headers) {
      capturedStatus = status;
      capturedHeaders = headers;
    },
  };
  mw(req303, res303, () => {
    res303.writeHead(303, {
      "cache-control": "no-store",
      location: "./",
      "set-cookie": `${currentName}=v1.2000000000.sig; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict`,
    });
  });
  assert.equal(capturedStatus, 303);
  assert.ok(Array.isArray(capturedHeaders["set-cookie"]), "303 response must carry both new cookie and stale cookie evictions");
  assert.equal(capturedHeaders["set-cookie"].length, 3);
  assert.ok(capturedHeaders["set-cookie"][0].includes("SameSite=Strict"), "active cookie must keep SameSite=Strict");
  assert.ok(capturedHeaders["set-cookie"][1].startsWith(`${oldPortName1}=; Max-Age=0;`));
  assert.ok(capturedHeaders["set-cookie"][2].startsWith(`${oldPortName2}=; Max-Age=0;`));

  // 已认证 200 顶层页面响应：仅清理旧端口残留 Cookie，不重发或篡改当前有效 Cookie 的 Max-Age/SameSite
  let headers200 = null;
  const req200 = {
    method: "GET",
    url: "/",
    headers: {
      host: "127.0.0.1:61419",
      cookie: `${currentName}=v1.2000000000.sig; ${oldPortName1}=v1.1.a`,
    },
  };
  const res200 = {
    writeHead(_status, headers) {
      headers200 = headers;
    },
  };
  mw(req200, res200, () => {
    res200.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  });
  assert.equal(headers200["set-cookie"], `${oldPortName1}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`);
}

console.log("webview boot hook order ok");
