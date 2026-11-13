import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("双语文案键一致，所有静态 UI 文案均存在", async () => {
  const source = await read("src/client.js");
  const dictionaries = JSON.parse(await read("src/locales.json"));
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort());
  for (const [, key] of source.matchAll(/\bt\("([A-Za-z.]+)"\)/g)) {
    if (key === "error.") continue;
    assert.ok(dictionaries.en[key], key); assert.ok(dictionaries.zh[key], key);
  }
});
test("客户端只用原生 React、语义主题和设置插槽，不注入外部 DOM", async () => {
  const source = await read("src/client.js"); const css = await read("src/style.css");
  assert.deepEqual([...source.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]), ["react"]);
  assert.match(source, /ctx\.slots\.inject\("settings.section"/);
  assert.match(source, /ctx\.slots\.inject\("plugins.bundle.config"/);
  assert.match(source, /role: "switch"/); assert.match(source, /"aria-checked": draftEnabled/);
  assert.match(source, /"aria-live": "polite"/); assert.match(source, /confirmShared: consent/);
  assert.doesNotMatch(source, /document\.body|iframe|innerHTML|localStorage/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(css, /focus-visible/); assert.match(css, /prefers-reduced-motion/);
  for (const [, token] of css.matchAll(/var\((--[^,)]+)/g)) assert.ok(token.startsWith("--dsw-alias-"));
});
test("包包含图标、运行文件及八语展示元数据，不运行安装脚本", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.equal(manifest.exports["./icon"], "./icon.svg");
  for (const key of ["preinstall", "postinstall", "install", "prepare"]) assert.equal(manifest.scripts[key], undefined);
  for (const path of ["lib/index.js", "lib/store.js", "lib/model.js", "lib/client.js", "cordis.patch.yml", "icon.svg"]) assert.ok((await stat(new URL("../" + path, import.meta.url))).size > 0);
  for (const language of ["zh", "en", "de", "fr", "es", "ja", "ko", "pt"]) {
    const locale = JSON.parse(await read(`locale/${language}.json`));
    assert.ok(locale.meta.title); assert.ok(locale.meta.description);
  }
  const icon = await read("icon.svg");
  assert.match(icon, /<svg/); assert.doesNotMatch(icon, /<script|href=|<foreignObject/);
});
