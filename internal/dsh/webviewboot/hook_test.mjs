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

console.log("webview boot hook order ok");
