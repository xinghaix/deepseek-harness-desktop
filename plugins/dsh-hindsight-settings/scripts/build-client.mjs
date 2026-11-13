import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(join(root, "src/client.js"), "utf8");
const locales = JSON.parse(await readFile(join(root, "src/locales.json"), "utf8"));
const css = await readFile(join(root, "src/style.css"), "utf8");
const output = "// 此文件由 scripts/build-client.mjs 生成，请编辑 src/ 下的源文件。\n" + source
  .replace("__HINDSIGHT_LOCALES__", () => JSON.stringify(locales))
  .replace("__HINDSIGHT_CSS__", () => JSON.stringify(css));
const target = join(root, "lib/client.js");
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== output) throw new Error("client.js 已过期，请运行 npm run build");
} else {
  await mkdir(join(root, "lib"), { recursive: true });
  await writeFile(target, output);
}
console.log(process.argv.includes("--check") ? "客户端构建一致" : "客户端构建完成");
