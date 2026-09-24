# dsh-web-fetch-allowlist

为经本地 Fake-IP / TUN（例如 Surge / Clash 的 `198.18.0.0/15`）解析的白名单域名提供原生 `web_fetch` 支持。插件包装内置 `http` fetch provider，不改变 `dsh-web.fetchProvider`。


## 兼容性

- **0.2.0+**：适配 DSH `0.1.7-rc.1`。客户端注入由已移除的 `settingsScope` 改为 `configForms`；Host 端不再调用已删除的 `settings.installSection`，改为对 `hosts` 使用 Schemastery `.volatile()` 读取 live 配置。`peerDependencies` 声明为 `^0.1.7-rc.1`，可在该版本上原生通过兼容性检查，无需 `dsh plugin allow-version`。
- **0.1.2**：面向 `0.1.6-alpha.x`（`settingsScope` + `installSection`），在 `0.1.7-rc.1` 上会卡在 `pending (waiting for service: settingsScope)`。

## 安装或更新

需要已安装的 DSH（`>=0.1.7-rc.1`，提供新版主侧栏插件管理页）和 Node.js 20 或更高版本，以及 DSH Host 提供的 settings / web 插件。

直接从 GitHub 安装，无需先克隆仓库或发布到 npm。以下命令可在任意目录执行，适用于 macOS / Linux 和 Windows PowerShell（需已安装 pnpm 和 Git）：

```sh
dsh plugin --profile web add "xinghaix/deepseek-harness-desktop#main&path:/plugins/dsh-web-fetch-allowlist"
```

该命令显式指定仓库的 `main` 分支和插件子目录，不固定到某个版本；请保留完整地址和引号，避免 shell 将 `&` 当作命令分隔符。需要固定版本时，可将 `main` 替换为 tag 或 commit，即 `#<tag 或 commit>&path:/plugins/dsh-web-fetch-allowlist`。

如果之前使用的是省略分支的 `#path:/plugins/dsh-web-fetch-allowlist` 地址，更新时请改用上述 `#main&path:…` 形式，避免继续沿用旧安装 spec 的锁定提交。指定分支不代表自动更新；重新安装后仍应核对已安装版本。

示例安装到 `web` profile；如使用其他 profile，请替换为实际名称，并使用与目标 DSH 相同的 `DSH_HOME`。本插件已包含可加载的 JavaScript，无需先构建桌面端。

从旧目录迁移或更新代码后，重新执行上述安装命令，再重启使用该 profile 的 DSH Web（桌面端用户需重启其托管的 DSH）。不要继续使用旧目录路径。

## 使用与安全边界

1. 关闭设置弹窗，打开 **Chat 主侧栏 → 插件 → 已安装 → dsh-web-fetch-allowlist**；启用插件后，白名单表单直接显示在插件详情页。**设置 → 内置插件** 只是插件清单，不再承载本插件的设置。
2. 每行填写一个域名、通配域名或 URL，例如 `example.com`、`*.example.com` 或 `https://example.com/docs`。
3. 点击 **保存** 后，在新的对话轮次调用 `web_fetch`；保存的配置在后续调用生效。离开插件详情页会放弃未保存的修改。

新版配置页使用 `plugins.bundle.config`，按包名 `dsh-web-fetch-allowlist` 挂载；旧的 `settings.plugin.item` 入口已移除。设置命名空间仍为 `web-fetch-allowlist`，原有已保存域名无需迁移。旧版 DSH 请固定到本次适配之前的插件提交。

白名单主机可以解析为公网单播地址或 Fake-IP `198.18.0.0/15`；loopback、RFC1918 私网、link-local 和元数据地址仍被阻止。裸域名及通配域名的匹配规则见 [测试](lib/hosts.test.js)。

[插件配置](cordis.patch.yml) 中的默认白名单为空，不预置任何个人或组织域名。安装后请在设置卡片中添加自己需要的域名；留空时沿用原生抓取行为。个人配置应只保存在本机 DSH 设置中，不要提交到仓库。此插件并非任意内网访问开关。

如果曾安装带有预置白名单的旧版本，更新插件不会自动删除已保存的用户设置，请在设置卡片中审阅并移除不需要的条目。

## 卸载

```sh
dsh plugin --profile web remove dsh-web-fetch-allowlist
```

卸载后重启对应的 DSH Web。

## 开发与验证

从仓库根目录进入插件目录；运行主机名匹配测试无需安装依赖：

```sh
cd plugins/dsh-web-fetch-allowlist
node --test lib/hosts.test.js test/*.test.mjs
npm pack --dry-run --ignore-scripts
```

需要安装开发依赖时，在该目录执行 `npm ci`，按 [依赖锁文件](package-lock.json) 安装。宿主集成验证仍需在安装并启用该插件的 DSH 中进行。
