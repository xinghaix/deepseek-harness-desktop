import assert from "node:assert/strict";
import { injectLoadBundle, stripComboPreloads } from "./index.js";

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

console.log("webview boot hook order ok");
