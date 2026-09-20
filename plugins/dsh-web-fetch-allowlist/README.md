# dsh-web-fetch-allowlist

为经本地 Fake-IP / TUN（例如 Surge / Clash 的 `198.18.0.0/15`）解析的白名单域名提供原生 `web_fetch` 支持。插件包装内置 `http` fetch provider，不改变 `dsh-web.fetchProvider`。

## 安装或更新

需要已安装的 DSH（`>=0.1.1-rc.1`）和 Node.js 20 或更高版本，以及 DSH Host 提供的 settings / web 插件。

以下命令从 **deepseek-harness-desktop 仓库根目录**执行。macOS / Linux：

```sh
dsh plugin --profile web add "$PWD/plugins/dsh-web-fetch-allowlist"
```

Windows PowerShell：

```powershell
dsh plugin --profile web add (Join-Path $PWD.Path "plugins/dsh-web-fetch-allowlist")
```

示例安装到 `web` profile；如使用其他 profile，请替换为实际名称，并使用与目标 DSH 相同的 `DSH_HOME`。本插件已包含可加载的 JavaScript，无需先构建桌面端。

从旧目录迁移或更新代码后，重新执行上述安装命令，再重启使用该 profile 的 DSH Web（桌面端用户需重启其托管的 DSH）。不要继续使用旧目录路径。

## 使用与安全边界

1. 打开 **设置 → 插件 → 插件配置**，找到 **Web fetch allowlist** 卡片。
2. 每行填写一个域名、通配域名或 URL，例如 `example.com`、`*.example.com` 或 `https://example.com/docs`。
3. 保存后，在新的对话轮次调用 `web_fetch`；保存的配置在后续调用生效。

白名单主机可以解析为公网单播地址或 Fake-IP `198.18.0.0/15`；loopback、RFC1918 私网、link-local 和元数据地址仍被阻止。裸域名及通配域名的匹配规则见 [测试](lib/hosts.test.js)。

初始白名单保留在 [插件配置](cordis.patch.yml)，安装后请在设置卡片中审阅并按需调整。此插件并非任意内网访问开关。

## 卸载

```sh
dsh plugin --profile web remove dsh-web-fetch-allowlist
```

卸载后重启对应的 DSH Web。

## 开发与验证

从仓库根目录进入插件目录；运行主机名匹配测试无需安装依赖：

```sh
cd plugins/dsh-web-fetch-allowlist
node --test lib/hosts.test.js
npm pack --dry-run --ignore-scripts
```

需要安装开发依赖时，在该目录执行 `npm ci`，按 [依赖锁文件](package-lock.json) 安装。宿主集成验证仍需在安装并启用该插件的 DSH 中进行。
