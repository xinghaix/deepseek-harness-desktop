import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';
import { marketInstallTarget as earliestInstallTarget, parseMarketIndex as parseEarliest } from 'dsh-plugin-market-index-021';
import { buildIndex, INDEX_URL } from './build.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const releases = JSON.parse(readFileSync(new URL('./releases.json', import.meta.url), 'utf8'));
const repo = 'https://github.com/xinghaix/deepseek-harness-desktop';
const initialPlugins = [
  'dsh-enhancements', 'dsh-hindsight-settings', 'dsh-mattpocock-skills', 'dsh-mcp-manager',
  'dsh-prompts', 'dsh-plugin-sandbox-escalation-fix', 'dsh-web-fetch-allowlist',
];

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-plugin-index-'));
  t.after(() => rmSync(dir, { recursive: true }));
  return dir;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

test('生成双版本可读的原生索引，仅包含清单中的 bundle 及图标', t => {
  const out = scratch(t);
  const expected = buildIndex(root, releases, out);
  const raw = readFileSync(join(out, 'index.json'), 'utf8');
  const disk = JSON.parse(raw);
  assert.deepEqual(disk, JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(parseEarliest(disk, INDEX_URL), parseMarketIndex(disk, INDEX_URL));
  for (const name of initialPlugins) assert.ok(disk.plugins.some(plugin => plugin.name === name), name);
  assert.ok(disk.plugins.every(plugin => !/(?:desktop-bridge|webview-boot)/u.test(plugin.name)));
  assert.deepEqual(readdirSync(out).sort(), ['icons', 'index.json']);
  assert.deepEqual(readdirSync(join(out, 'icons')).sort(), disk.plugins.map(plugin => plugin.icon.slice('icons/'.length)).sort());

  const parsed = parseMarketIndex(disk, INDEX_URL);
  for (const plugin of parsed.plugins) {
    assert.ok(plugin.title.en && plugin.title.zh, plugin.name);
    assert.ok(plugin.description.en && plugin.description.zh, plugin.name);
    const latest = plugin.versions[0];
    const { commit, path } = latest.source;
    assert.equal(plugin.icon, new URL(`icons/${path.split('/').at(-1)}.svg`, INDEX_URL).href);
    const manifest = JSON.parse(git('show', `${commit}:${path}/package.json`));
    assert.equal(readFileSync(join(out, 'icons', path.split('/').at(-1) + '.svg'), 'utf8'),
      git('show', `${commit}:${path}/${manifest.icon.replace(/^\.\//u, '')}`));
    for (const version of plugin.versions) {
      const { commit, path } = version.source;
      const pkg = JSON.parse(git('show', `${commit}:${path}/package.json`));
      assert.equal(plugin.name, pkg.name);
      assert.equal(version.version, pkg.version);
      assert.equal(version.publishTimestamp, Number(git('show', '-s', '--format=%ct', commit)));
      assert.equal(version.source.type, 'git');
      const install = { spec: `git+${repo}.git#${commit}&path:/${path}` };
      assert.deepEqual(marketInstallTarget(plugin.name, version), install);
      assert.deepEqual(earliestInstallTarget(plugin.name, version), install);
    }
  }
  // 顶层缺省时采用实际 DSH peers，不采用历史的嵌套 dsh.engines 值。
  const allowlist = parsed.plugins.find(plugin => plugin.name === 'dsh-web-fetch-allowlist');
  assert.equal(allowlist.versions.find(version => version.version === '0.2.3').engines.dsh, '^0.2.0-rc.1');
  buildIndex(root, releases, out);
  assert.equal(readFileSync(join(out, 'index.json'), 'utf8'), raw);
});

test('拒绝提交与清单版本不符、目录越界或重复发布', t => {
  const out = scratch(t);
  const { commit } = releases[0];
  assert.throws(() => buildIndex(root, [{ commit, plugins: { 'dsh-enhancements': '999.0.0' } }], out), /版本.*不一致/u);
  assert.throws(() => buildIndex(root, [{ commit, plugins: { '../internal/dsh/desktopbridge': '1.0.0' } }], out), /非法插件目录/u);
  assert.throws(() => buildIndex(root, [releases[0], releases[0]], out), /duplicate/u);
  assert.deepEqual(readdirSync(out), []);
});
