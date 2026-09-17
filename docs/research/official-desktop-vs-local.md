# 官方 DeepSeek Harness 桌面端 vs 本仓库桌面端

> 研究目标：以一手来源核对官方 `apps/desktop/README.zh.md` 的描述，并与本仓库当前实现比较语言、框架、WebView、进程模型、构建/打包、跨平台、升级和安全边界。
>
> 口径：官方使用 `deepseek-ai/deepseek-harness` 的 `master`；本仓库基于当前工作树。本文只记录研究结论，不修改产品源码。

## 结论摘要

1. 官方桌面端不是简单的 `dsh web` 包装器，而是 TypeScript/Electron 应用：它携带精确版本的 dsh、Desktop Host、Node、pnpm、生产依赖和独立插件 profile。
2. 官方使用 `dsh-app://`、版本化分帧 byte pipe、Node IPC 来避免 Desktop 与 Host 之间的 loopback TCP 服务；这套方案的价值在于运行时可复现和版本可控，不在于 Electron 本身。
3. 本仓库是有意的轻量集成壳：Go 1.27 + Wails 3（当前 `go.mod` 为 v3.0.0-beta.22），复用用户已安装的 `dsh` CLI/DSH Home，启动外部 `dsh web`，使用系统 WebView 和认证 loopback bridge。
4. 不建议为了追平官方迁移 Electron。最值得借鉴的是版本契约、Renderer 权限收口、发布签名、运行时/进程 smoke test，而不是 Chromium、Electron 或私有 pnpm profile。
5. 官方 README 明确当前 Desktop 发布目标为 macOS arm64/x64、Windows x64；Linux 不是受支持的 Desktop 发布目标，虽然 builder 配置仍保留 AppImage 分支。

## 1. 官方一手来源

- [官方桌面中文 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md)
- [官方 Desktop manifest](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/package.json)
- [Electron main process](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/main.ts)
- [Host child process](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/host-process.ts)
- [Host framed protocol](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/host-protocol.ts)
- [preload/app preload](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/preload.ts)
- [runtime descriptor](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/src/runtime-tree.ts)
- [Node/pnpm preparation](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/scripts/prepare-runtime.ts)
- [electron-builder configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/electron-builder.config.mjs)
- [官方 bundled runtime Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)

## 2. 官方技术栈与架构

### 2.1 语言、框架和运行时

官方 `apps/desktop/package.json` 声明：

- TypeScript / ES Modules
- Electron `^44.0.0`
- `electron-builder ^26.15.3`
- `electron-updater ^6.8.9`
- `semver`
- pnpm workspace
- `tsc -b && tsdown`

`prepare-runtime.ts` 固定下载 Node `24.17.0`，使用 Node 官方 `SHASUMS256.txt` 校验归档，并复制锁定版本的 pnpm。生产包把 dsh 和生产依赖放入 `resources/dsh`，把 runtime 放入应用资源。

### 2.2 WebView、协议和通信

官方主进程注册特权 `dsh-app` scheme：

- `dsh-app://shell/...`：本地启动页和插件管理器资源
- `dsh-app://app/...`：转发给当前 Host 的 Fetch
- 不打开 Desktop-owned loopback Web 服务
- Fetch 请求和流式响应走有界 framed byte pipes
- Node IPC 只承担生命周期控制

`host-protocol.ts` 定义了协议版本、请求/响应管道、64 KiB data frame 和控制 payload 限制。`host-process.ts` 使用请求 FD、响应 FD 和 Node IPC 启动 Host；生产模式通过 `ELECTRON_RUN_AS_NODE=1` 启动 Node-compatible child。

### 2.3 Renderer 安全

官方 `BrowserWindow` 显式设置：

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- 禁止 `window.open`
- 导航只允许 `dsh-app:`
- IPC handler 校验 sender frame 和 hostname

`preload.ts` 通过 `contextBridge` 暴露窄的、类型化的 `dshDesktop` API。`preload-app.ts` 对应用页面只暴露协议版本 marker；启动页才获得恢复、backend 状态、禁用插件和重置等控制能力。Renderer 不直接获得原始 IPC、文件系统、shell 或任意 pnpm 参数。

### 2.4 Profile、插件和版本绑定

官方拥有 `$DSH_HOME/profiles/desktop`：

- `resources/dsh` 携带核心运行时和生产依赖
- profile 只保存外部插件的精确依赖
- 第一方共享包用目录 symlink / Windows junction 连接到不可变 runtime
- 普通插件依赖必须解析在 profile 内部
- profile 有独立 pnpm state、lock 和事务边界
- Host 停止后才修改 profile，完成后重启 Host
- `allowBuilds` 只批准审查过的 lifecycle/native build
- 不兼容插件不会被静默删除或自动降级

运行时描述文件记录 release、Node、平台、架构、共享包和最终文件 SHA-256。

**重要修正：**官方启动时不会每次重新枚举或重新计算全部已安装 runtime 文件的哈希。启动时读取 descriptor/shared records、必要 Host 入口和运行时身份；逐文件内容、缺失、多余和链接文件的完整清单验证属于构建/发布阶段。依据：[官方 bundled runtime Agent Note 第 49 行](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md#L49)。

### 2.5 构建、签名与发布

官方 `README.zh.md` 固定发布目标为：

- `mac-arm64`
- `mac-x64`
- `win-x64`

README 明确 Linux 不是受支持的 Desktop 发布目标；`electron-builder.config.mjs` 虽有 AppImage 配置，但不能据此推断 Linux 是正式发布矩阵的一部分。

macOS 需要 signing identity、hardened runtime、notarization 和 Team ID；Windows 需要 EV/SafeNet/SignTool 方案。更新由 `electron-updater` 在用户确认后下载，停止 backend，再交给 updater 安装和重启。

## 3. 本仓库当前技术栈和架构

依据：`go.mod:1-20`、`main.go:1-83`、`AGENTS.md:7-70`。

- Go `1.27`
- Wails `v3.0.0-beta.22`
- 配置页为嵌入式 HTML/CSS/JavaScript
- Chat 为独立 Wails WebView
- macOS 使用 WKWebView，Windows 使用 WebView2，Linux 使用 WebKitGTK 6
- `internal/dsh` 管理 CLI 发现、启动/停止、锁、owned process tree 和 bridge
- `internal/desktop` 管理窗口、菜单、托盘、快捷键、文件对话框和更新
- 不捆绑、不下载第二份 `dsh` CLI
- 不迁移用户配置、不改写凭据、不接管外部进程

数据流：

```text
Wails Go 主进程
├── 配置窗口：assets/web
├── Chat 窗口：Wails WebView
│   └── http://127.0.0.1:<dsh web port>/
└── 用户已安装的 dsh web 子进程
    ├── --patch webview-boot
    └── --patch desktop-bridge
```

`internal/dsh/manager.go:578-725` 会创建 Desktop data dir、获取锁、写两个 patch 目录，再用 `dsh web --host 127.0.0.1 --port ... --no-open` 启动外部 CLI。

`internal/desktop/service.go:153-186` 使用独立 Chat WebView 首次加载一次性 token URL。注释说明：从配置 WebView 的 `wails://` 导航到 loopback 时，dsh 的 `SameSite=Strict` 303 登录 Cookie 会丢失，因此 Chat 必须是独立 WebView。

进程所有权：

- Unix 使用独立进程组
- Linux 使用 `Pdeathsig: SIGKILL`
- Windows 使用 Job Object 的 `KILL_ON_JOB_CLOSE`
- 只回收 Desktop 自己拉起的进程树
- 有全局锁、owned marker、自动重启和超时清理

### 3.1 本地 Bridge

`internal/dsh/bridge.go`：

- 只监听 `127.0.0.1:0`
- 随机生成 32 字节 token
- 使用 `X-DSH-Desktop-Bridge-Token`
- 常量时间比较 token
- 白名单 RPC 和 JSON body 校验
- body 上限 1 MiB
- endpoint 目录 `0700`，文件 `0600`

**Token persistence caveat：**当前实现会把 `{url, token}` 写入 `desktop-bridge-endpoint.json`（`internal/dsh/bridge.go:190-208`），但不会写入页面、日志、`desktop-state.json` 或普通状态响应。`AGENTS.md:188` 的“令牌不进状态 JSON”表述过宽，应明确 endpoint 文件例外；如果威胁模型包含同一用户下的其他进程，还应单独评估 token 落盘问题。

### 3.2 WebView boot

`webview-boot` 针对 DSH client-modules 的长 `/plugins/??...` 和 HTTP 431：

1. 正常情况 combo 一次 XHR + eval
2. 只有 431 时拆成官方单包语法
3. 最多 8 路并发

不要退回到永远拆包、顺序加载的实现。

## 4. 关键差异矩阵

| 维度 | 官方 Desktop | 本仓库 | 判断 |
|---|---|---|---|
| 产品关系 | 携带精确 dsh/Host/Node/pnpm/生产依赖和私有 profile | 复用用户已有 dsh/DSH Home | 官方可重复，本仓库轻量且不接管用户环境 |
| 语言/框架 | TypeScript + Electron 44 + Node | Go 1.27 + Wails 3 beta | 本仓库避免 Electron，但承担系统 WebView 差异 |
| WebView | Electron Chromium Renderer | WKWebView/WebView2/WebKitGTK | 官方一致性更高，本仓库安装包和原生感更好 |
| 通信 | `dsh-app://` + framed pipes + Node IPC | loopback HTTP + token bridge | 官方端口面更窄，本仓库兼容外部 CLI |
| DSH 启动 | 私有 Host 直接组合 Cordis/DSH | 外部 `dsh web` | 官方可控，本仓库保留用户 CLI 自由度 |
| 插件 | Desktop 私有 pnpm profile | Desktop 只注入 bridge | 不应为追平官方而引入包管理风险 |
| 版本 | Desktop 与 dsh 精确绑定 | Shell 与 dsh 独立升级 | 本仓库应增加兼容范围/能力协商 |
| 跨平台 | 正式矩阵为 mac-arm64/mac-x64/win-x64 | 六目标 mac/win/linux | 本仓库覆盖面更广 |
| 更新 | 签名统一单元 + electron-updater | GitHub latest + SHA256SUMS + 直接替换 | 本仓库最大差距是发布者身份验证 |
| Renderer 安全 | sandbox/contextIsolation/navigation/sender 白名单 | Wails 页面和绑定策略已有基础，但需要显式契约审计 | 不等于已证明 Wails 不安全，而是文档/测试缺口 |

## 5. 改进建议（不使用 Electron）

### P0：显式收窄 Wails API

当前 `main.go` 通过嵌入 `desktop.Service` / `dsh.Manager` 注册 Wails service；`internal/dsh/bridge.go` 的 `BridgeHost` 同时承载窗口、偏好、会话和更新能力。建议建立显式 `WailsFacade`，只暴露管理窗口需要的方法；Chat WebView 只通过已有认证 bridge，不依赖管理 API。

可以把 seam 分成：

```text
internal/dsh
├── RuntimePort
├── ProcessOwnership
└── BridgeServer

internal/desktop
├── WindowAdapter
├── PreferenceAdapter
├── UpdateAdapter
└── WailsFacade
```

这会让接口更深、调用面更小，也为未来替换 Wails/Tauri 保留余地。

### P0/P1：引入可替换 Transport seam，分阶段借鉴官方无端口设计

以下能力可以直接借鉴，但不要求复制官方的私有 profile 或第二份 dsh：

- **`dsh-app://` 入口**：让 Renderer 只面向一个稳定的应用资源/请求入口，不感知后端是 HTTP、pipe 还是其他 transport；它是 transport-independent 的边界，不等于当前就必须移除 dsh web 的内部端口。
- **`HostTransport` / `ChatTransport` seam**：把当前 `dsh web + 127.0.0.1:<port>` 从 `Manager` 中抽成 `LoopbackHTTPAdapter`，未来可以替换为 `FDTransport`、Unix domain socket 或 Windows named pipe Adapter。
- **framed stream + backpressure**：用于未来 Host/pipe 模式的有界请求、响应和流式输出；需要限制 frame 大小、校验协议版本，并在 consumer `desiredSize` 不足时暂停生产者。
- **typed capability / protocol version**：启动时协商 dsh、patch、bridge 和 transport 能力；不兼容时自动回退 HTTP，而不是让 Chat 进入半初始化状态。
- **Renderer API 权限收口**：管理窗口使用窄的 `WailsFacade`；Chat Renderer 不拿原始 Wails service、文件系统或 shell 能力，只获得必要的 transport/capability 入口。
- **HTTP fallback**：HTTP 是当前默认、兼容已安装 CLI 的 Adapter；pipe/custom scheme 只作为能力匹配后的优化路径，失败必须回退到 loopback HTTP。

建议按以下顺序实施：

1. **先抽象，不改变行为**：增加 `HostTransport` 接口和 `LoopbackHTTPAdapter`，继续复用同一个用户 `DSH_HOME`、sessions、settings、credentials 和 workspace；不创建第二套 profile。
2. **加入版本化能力握手**：记录 `dshVersion`、`bridgeProtocol`、`webviewBootProtocol`、`transport` 和 `features`，支持 `auto | http | pipe` 的内部选择逻辑。
3. **再验证 Wails custom scheme**：若 Wails 3 在 macOS/Windows/Linux 都能稳定提供等价的请求拦截/自定义 scheme，再让 `dsh-app://app` 委托给 `HostTransport`。这一阶段可以内部仍走 HTTP，先隐藏真实 port 和 token，不宣称已经实现真正无端口。
4. **最后才做真正 pipe**：只有当上游 dsh 提供 stdio/FD/Host transport，或明确接受对应 patch/fork 后，才实现 bounded framed stream + backpressure Adapter；不要试图仅靠 `--patch` 把现有 HTTP server 假装成 pipe。
5. **Bridge 单独演进**：Chat transport 无端口不等于 Desktop Bridge 自动无端口。当前 bridge 的 loopback + token + whitelist 可以保留；Unix socket/named pipe 属于后续独立改造。

这条路线同时保留官方设计的可靠性收益和本项目“复用用户已有数据、不搞两套”的产品承诺。

### P0：更新包增加可信发布身份

保留现有 HTTPS、GitHub host allowlist、SHA-256 和用户确认流程，同时增加：

- Ed25519/Sigstore 签名 manifest
- 版本、OS/arch、artifact digest、应用 ID 和签名身份
- macOS Team ID / notarization 验证
- Windows WinVerifyTrust/证书链验证
- 更新替换失败时保留旧版本并可回滚

本地 macOS entitlements 当前包含：

- `com.apple.security.cs.allow-jit`
- `com.apple.security.network.client`
- `com.apple.security.files.user-selected.read-only`

依据：`assets/darwin/entitlements.plist:5-10`。当前 `scripts/sign-darwin.sh` 使用 ad-hoc `codesign --sign -`，不是 Developer ID/notarized；生产签名时应使用 hardened runtime，并评估是否真的需要 JIT entitlement。

### P1：增加 dsh/patch 兼容性身份

不要直接复制官方的精确版本绑定，而是记录：

- `dsh --version`
- bridge protocol version
- webview-boot patch version
- desktop-bridge patch version
- OS/arch/WebView runtime
- capability flags

启动时进行能力协商，不兼容时给出明确提示或关闭增强功能，而不是显示通用启动失败。

### P1：补齐 WebView/进程/打包 smoke 契约

覆盖：

- Chat token URL 首载和 Cookie 行为
- loopback URL、端口归属和 redirect 校验
- `window.open`、外部导航、下载、拖放、JS 注入策略
- bridge token 不进入页面、日志和普通状态响应
- owned process tree 不遗留
- lock/marker/endpoint 恢复
- `.app`、`.exe`、Linux 二进制版本/架构/资源/签名/SHA-256
- macOS/Windows/Linux 真实目标机验收

保留现有的：

```sh
node internal/dsh/webviewboot/hook_test.mjs
go test ./internal/dsh/
make test
```

### 明确排除：Portable Runtime

本轮不实现 Portable Runtime、Bundled Node、第二份 dsh CLI 或独立 profile。产品仍只复用用户已安装的 `dsh`、`DSH_HOME`、凭据、sessions、settings 和 workspace；未来若重新提出该产品模式，必须另立方案并重新审查数据边界。

## 6. 已落地实现与仍需上游支持的边界

本轮 P0/P1（排除 Portable Runtime）已经落实到代码，并保持与上游能力对齐的诚实边界：

- `main.go` 注册显式 `internal/desktop.WailsFacade`，不再把 `Service`/`Manager` 图直接绑定到 Wails；facade 的绑定方法接收 `context.Context`，按 Wails window name 对管理窗、配置窗和 Chat 窗做最小权限 gate。这是窗口名 gate，不是 renderer origin ACL。`BridgeHost` 由 Window/Path/Prefs/Session/Update capability interfaces 组合。
- `internal/dsh/transport.go` 提供 `HostTransport`、`ChatTransport` 和默认 `LoopbackHTTPAdapter`。Ready 永不跟随 Location，并要求重定向留在 announced loopback 端口；首载 token URL、后续无 token 同源 URL 不变。`dsh-app://chat/` 只是逻辑入口/capability 字段，不是已注册的原生 scheme。
- 认证 bridge `/v1/capabilities` 与 `/v1/handshake` 已落地。握手异步且不阻塞既有 RPC（HTTP fallback）；不兼容时设置页给出明确提示并关闭增强功能。`framed_stream.go` 只是未来 Host/FD/pipe Adapter 的有界契约，没有把现有 HTTP CLI 假装成 pipe。
- Chat URL validator、窗口权限/DevTools/文件拖放关闭、管理页 CSP、Chat chrome 的 `window.open`/外链 JS 防护已落地。Wails 当前公共 API 仍没有跨平台可取消的 NavigationStarting/NewWindowRequested/DownloadStarting；这些不能写成已完成的 native 拦截。
- 更新：canonical Ed25519 manifest 为默认信任根；无 manifest 的 release 被拒绝，除非测试显式 `allowLegacy`。release workflow 用 `DSH_UPDATE_MANIFEST_PRIVATE_KEY` 签名，并用 `vars.DSH_UPDATE_MANIFEST_PUBLIC_KEY` + `DSH_REQUIRE_SIGNED_UPDATES=1` 把公钥注入生产二进制。apply 失败走 quarantine restore；管理窗 `WindowRuntimeReady` 后才 `MarkHealthy` 并清理 `.old`。启动不会把 launched 事务自动 crash-rollback，以免误撤掉已替换成功的新版本。
- 契约测试覆盖 transport/redirect 端口归属、capabilities/handshake、token 脱敏、framed stream、facade context、Chat URL、chrome 导航防护、update manifest/download/restore/identity。三端真实 WebView E2E、Developer ID/Authenticode 公证、原生 `dsh-app` scheme、真实 dsh FD/stdio transport 仍需目标机/CI 或上游能力，不能由静态测试冒充完成。

上游依赖边界保持明确：Wails 没有跨平台 per-window binding ACL、可取消导航/新窗/下载 hooks 或 `dsh-app` scheme request proxy；外部已安装 dsh 当前也没有 Host FD/pipe lifecycle。可替换 seam 和 HTTP fallback 已完成，只有上游能力具备后才可接入真正的无端口 transport。

## 7. 不建议做的事

- 不要为了追平官方引入 Electron。
- 不要在当前产品模式下静默捆绑第二份 dsh CLI。
- 不要为了模仿官方而强行把外部 `dsh web` 改成 framed pipe；那会失去复用 CLI 的主要价值。
- 不要把 bridge 改成无认证的本地 HTTP。
- 不要把 `webview-boot` 改回永远拆包加载。
- 不要在真正需要插件安装前引入 pnpm profile、lifecycle allowlist 和依赖图管理。

## 8. 最终判断

如果目标是个人/开发者使用、复用已有 DSH、保持配置归属、覆盖 Linux 和更多架构，同时不使用 Electron，本仓库的 Go/Wails 路线合理。

如果目标是面向普通用户的零依赖发行版、插件市场和完全可重复的运行时组合，官方方案在 runtime/profile/package graph、Renderer 权限收口和签名更新链上更完整；但这些能力可以逐步移植到 Go/Wails，不意味着必须采用 Electron。

本轮完成的三个核心改动：

1. 显式 `WailsFacade`、窗口 gate 和更窄的 bridge capability seam；
2. dsh/patch/bridge capability manifest、transport seam、framed/backpressure 契约和 HTTP fallback；
3. Ed25519 manifest、下载/平台校验、transaction rollback 与健康标记。

真正的 custom scheme、FD/pipe transport 和三端 WebView E2E 仍按上游依赖边界保留为后续工作，不纳入本轮已完成声明。
