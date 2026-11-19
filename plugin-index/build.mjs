import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
import { parseMarketIndex as parseEarliestMarketIndex } from 'dsh-plugin-market-index-021';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPOSITORY = 'https://github.com/xinghaix/deepseek-harness-desktop';
export const INDEX_URL = 'https://xinghaix.github.io/deepseek-harness-desktop/index.json';
const TITLE = { en: 'DSH Desktop Community Plugins', zh: 'DSH 桌面端社区插件' };
const ARCHIVE_NOTE = {
  en: 'Desktop builds with a built-in archive page do not need this plugin.',
  zh: '桌面端已内置归档页时，无需安装此插件。',
};

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function fileAt(root, commit, directory, relative) {
  const path = typeof relative === 'string' ? relative.replace(/^\.\//u, '') : '';
  if (!path || path.split('/').some(part => !/^[\w.-]+$/u.test(part) || part === '.' || part === '..')) {
    throw new Error(`${directory}: 非法包文件路径 ${JSON.stringify(relative)}`);
  }
  const target = `${directory}/${path}`;
  if (!/^100(?:644|755) blob /u.test(git(root, 'ls-tree', commit, '--', target))) {
    throw new Error(`${commit}:${target} 不是已提交的普通文件`);
  }
  return git(root, 'show', `${commit}:${target}`);
}

function dshRange(pkg) {
  if (Object.hasOwn(pkg.engines ?? {}, 'dsh')) return pkg.engines.dsh;
  // DSH 不读嵌套的 dsh.engines；若多个 DSH peer 范围不同，要求包显式声明范围。
  const ranges = new Set(Object.entries(pkg.peerDependencies ?? {})
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .map(([, range]) => range));
  if (ranges.size > 1) throw new Error(`${pkg.name}: 多个 DSH peer 范围不一致，请在包中声明 engines.dsh`);
  return [...ranges][0];
}

function displayAt(root, commit, directory, pkg) {
  const title = { en: pkg.name };
  const description = { en: pkg.description ?? pkg.name };
  for (const path of git(root, 'ls-tree', '-r', '--name-only', commit, '--', `${directory}/locale`).trim().split('\n')) {
    if (!path) continue;
    const relative = path.slice(directory.length + 1);
    const language = /^locale\/([a-z][a-z0-9-]*)\.json$/u.exec(relative)?.[1];
    if (!language) continue;
    const { meta } = JSON.parse(fileAt(root, commit, directory, relative));
    if (meta?.title) title[language] = meta.title;
    if (meta?.description) description[language] = meta.description;
  }
  if (pkg.name === 'dsh-enhancements') {
    description.en += ` ${ARCHIVE_NOTE.en}`;
    description.zh = `${description.zh ? `${description.zh} ` : ''}${ARCHIVE_NOTE.zh}`;
  }
  return { title, description };
}

export function buildIndex(root, releases, output) {
  if (!Array.isArray(releases) || !releases.length) throw new Error('发布清单不能为空');
  const packages = new Map();
  for (const { commit, plugins } of releases) {
    if (!/^[a-f0-9]{40}$/u.test(commit) || git(root, 'cat-file', '-t', commit).trim() !== 'commit') {
      throw new Error(`无效发布提交：${commit}`);
    }
    // Pages 只从 main 部署；发布提交必须随当前分支历史一起可达。
    git(root, 'merge-base', '--is-ancestor', commit, 'HEAD');
    const publishTimestamp = Number(git(root, 'show', '-s', '--format=%ct', commit).trim());
    if (!plugins || Array.isArray(plugins) || typeof plugins !== 'object' || !Object.keys(plugins).length) {
      throw new Error(`${commit}: 缺少插件版本`);
    }
    for (const [slug, version] of Object.entries(plugins)) {
      if (!/^dsh-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) throw new Error(`非法插件目录：${slug}`);
      const directory = `plugins/${slug}`;
      const pkg = JSON.parse(fileAt(root, commit, directory, 'package.json'));
      if (pkg.version !== version) throw new Error(`${directory}: 清单版本 ${version} 与发布提交中的 ${pkg.version} 不一致`);
      const exports = Object.values(pkg.exports ?? {})
        .flatMap(value => typeof value === 'string' ? [value] : Object.values(value ?? {}));
      const files = new Set([pkg.dsh?.bundle?.patch, ...[pkg.main, ...exports]
        .filter(path => typeof path === 'string' && !path.includes('*'))]);
      for (const file of files) fileAt(root, commit, directory, file);
      const dsh = dshRange(pkg);
      if (dsh !== undefined && typeof dsh !== 'string') throw new Error(`${directory}: engines.dsh 必须是字符串`);
      const entry = packages.get(slug) ?? { name: pkg.name, directory, versions: [] };
      if (entry.name !== pkg.name) throw new Error(`${directory}: 不可在同一条目内更换包名`);
      entry.versions.push({ version, publishTimestamp, source: { type: 'git', url: REPOSITORY, commit, path: directory }, engines: { dsh } });
      packages.set(slug, entry);
    }
  }

  const index = {
    format: 1,
    title: TITLE,
    plugins: [...packages.values()].map(({ name, directory, versions }) => ({
      name, repository: { url: REPOSITORY, directory }, versions,
    })),
  };
  const icons = new Map();
  const sorted = parseMarketIndex(index, INDEX_URL);
  for (const [position, plugin] of index.plugins.entries()) {
    const { commit, path: directory } = sorted.plugins[position].versions[0].source;
    const pkg = JSON.parse(fileAt(root, commit, directory, 'package.json'));
    Object.assign(plugin, displayAt(root, commit, directory, pkg));
    if (typeof pkg.icon !== 'string' || !pkg.icon.endsWith('.svg')) throw new Error(`${directory}: 缺少 SVG 图标声明`);
    plugin.icon = `icons/${basename(directory)}.svg`;
    icons.set(plugin.icon, fileAt(root, commit, directory, pkg.icon));
  }
  parseMarketIndex(index, INDEX_URL);
  parseEarliestMarketIndex(index, INDEX_URL);

  mkdirSync(resolve(output, 'icons'), { recursive: true });
  for (const [path, svg] of icons) writeFileSync(resolve(output, path), svg);
  writeFileSync(resolve(output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const releases = JSON.parse(readFileSync(new URL('./releases.json', import.meta.url), 'utf8'));
  const output = resolve(process.argv[2] ?? resolve(ROOT, 'dist/plugin-index'));
  const index = buildIndex(ROOT, releases, output);
  console.log(`已生成 ${index.plugins.length} 个插件：${resolve(output, 'index.json')}`);
}
