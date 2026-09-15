# AGENTS.md — Deepseek Harness Desktop

给在本仓库工作的**编码助手与贡献者**用的技术说明（架构、边界、构建、发版）。

面向最终使用者的安装与日常使用说明见 [`README.md`](README.md)（中文）与 [`README.en.md`](README.en.md)（English）——请勿把实现细节写回 README。

## 产品定位

轻量桌面客户端：复用用户 **已安装**的 `dsh` CLI 与现有 DSH Home，在本应用的桌面 WebView 中打开 DSH Chat。

不做的事：

- 不捆绑 / 不下载第二份 DSH CLI
- 不迁移用户配置、不重写凭据、不生成第二份 YAML
- 不接管或杀死非本桌面端拥有的进程
- 不把 Chat 丢到系统默认浏览器

## 架构总览

```text
┌─────────────────────────────────────────────────────────┐
│  Wails 3 shell (main.go, build tag: wails)              │
│  ┌────────────────────┐  ┌────────────────────────────┐ │
│  │ internal/desktop   │  │ assets/web (配置页 UI)      │ │
│  │ 窗口 / 菜单 / 绑定  │  │ Chat = 指向 DSH 的 WebView │ │
│  └─────────┬──────────┘  └─────────────▲──────────────┘ │
│            │                           │                │
│  ┌─────────▼──────────┐                │                │
│  │ internal/dsh       │  启动 dsh web ─┘                │
│  │ Manager + 发现 CLI  │  --patch webview-boot           │
│  │ 进程树 / 锁 / 监督  │  NODE_OPTIONS max-header-size   │
│  │ 127.0.0.1 桥接 HTTP │  --patch desktop-bridge         │
│  └─────────┬──────────┘                                 │
│            │ 仅注入给自己拉起的子进程                     │
└────────────┼────────────────────────────────────────────┘
             ▼
      本机 dsh CLI  ──►  DSH Cordis Host + client-modules
             ▲
             │ 内置：--patch desktop-bridge（嵌入覆盖）
             └──── 经已认证 RPC 调桌面回环控制面（令牌不落日志）
```

分层：

| 层           | 路径                                      | 职责                                                                                                                                   |
|--------------|-------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| 入口         | `main.go`                                 | Wails 应用、资源嵌入、单实例、`main.DSH` 服务包装、宿主菜单                                                                            |
| 桌面 UI      | `internal/desktop`                        | 配置窗 / Chat 窗、标题栏与安全区、文件对话框、配置模态、菜单动作；依赖 Wails                                                           |
| 国际化       | `internal/i18n`                           | 嵌入式 locales JSON、Resolve/Catalog/T/TActive；进程 Active 语言；桌面 prefs + LocaleBundle/SetLanguage                                  |
| DSH 内核     | `internal/dsh`                            | CLI 发现、启动/停止、进程组或 Job Object、全局锁与 owned-process 标记、回环桥接；**不依赖 Wails**，便于单测                            |
| 壳状态       | `internal/desktopstate`                   | 持久偏好 `DSH_HOME/.deepseek-harness-desktop/desktop-state.json`（prefs / launch / update；与运行时同目录）                            |
| WebView boot | `internal/dsh/webviewboot*`               | 每次启动写入 `DSH_HOME/.deepseek-harness-desktop/webview-boot/` 的 `--patch`；解决 WKWebView 长 combo `/plugins/??…` 与 HTTP 431       |
| 更新         | `internal/update`                         | 查 GitHub Release、下载、平台 apply；不自动静默安装                                                                                    |
| 版本         | `internal/version`                        | `Version` 默认源码为 `"dev"`；本地构建经 `scripts/app-version.sh` 打成 `{最新发布}-dev`（如 `0.1.1-dev`）；发布包用 `-ldflags` 从 tag 注入 |
| 桌面桥接     | `internal/dsh/desktopbridge*`             | 每次启动写入 `DSH_HOME/.deepseek-harness-desktop/desktop-bridge/` 的 `--patch`；Chat 设置左侧一级「桌面设置」（`settings.section`）；与 webview-boot 并列 |
| 构建         | `scripts/build.sh`、`Makefile`            | 本地/CI 打包与自签名；`make build` 包装脚本，CI 也可直接调 `scripts/build.sh`                                                            |

### 进程与数据边界

- 显式传入 `DSH_HOME`；桌面运行目录：`DSH_HOME/.deepseek-harness-desktop`（0700），不是 DSH cwd。可用 `DSH_DESKTOP_STATE_DIR` 覆盖该目录。
- **同一运行目录**（`DSH_HOME/.deepseek-harness-desktop/`）内分文件：
  - 冷配置：`desktop-state.json`（prefs / launch / update）
  - 热状态：`desktop-process.json`、`desktop-bridge-endpoint.json`、`dsh.lock`；以及 `desktop-bridge/`、`webview-boot/` patch
  - 同目录下 `settings.yaml`、`profiles/`、`storages/`、`.credentials.yaml` 等为 **dsh CLI/运行时** 数据
- 冷配置与热状态保持分文件（不要并进一个 JSON）：寿命与 token 安全不同；目录已统一。
- Chat workspace 独立可配；未配置时默认 `DSH_HOME/workspaces`（在 DesktopDir 之外）。已配置路径原样使用。
- 同一用户同时只允许一个由本桌面端拥有的 DSH（应用单实例锁 + DSH 锁 + 生命周期串行化）。
- macOS：独立进程组 + 可选 supervise；Windows：Job Object（关闭即回收）+ `taskkill /T` 兜底。
- 端口占用则失败，不抢端口。
- 启动时为 Node 子进程合并 `NODE_OPTIONS=--max-http-header-size=131072`（保留用户已有同名 flag）。

### WebView combo 加载（重要）

DSH client-modules 会用很长的 `/plugins/??a,b,c&rev=…`。WKWebView 对长 `<script src>` 不可靠；Cookie + Request-Line 还会顶穿
Node 默认 16KiB header（HTTP 431）。

策略（`webviewboot/index.js`，经 Cordis `--patch` 注入）：

1. **热路径**：整段 combo 一次 XHR + `eval`（依赖上面抬高的 header 上限）。
2. **仅当 431**：拆成官方语法的单包 `??pkg&rev=`，最多 8 路并发再加载。
3. 拦截 combo 的 `script.src` / `append`，并剥掉 combo preload。

不要再回到「永远拆批顺序加载」：插件变多会又慢又脆。改这块前先跑 `node internal/dsh/webviewboot/hook_test.mjs` 与
`go test ./internal/dsh/`。

### 窗口与 UX 约定

- 配置页：`assets/web`；冷启动有成功配置时可跳过重复探测直接起 DSH。
- Chat：加载本机 DSH HTTP 源，不外跳浏览器。
- macOS：原生 traffic lights；Chat 标题栏安全区对齐 DSH 84px 折叠轨道。
- Windows / Linux：页面内悬浮窗控 + 内容安全区。
- 宿主菜单承载「打开配置 / 打开 Chat / 关闭窗口 / 退出」等（macOS 应用菜单；Win/Linux「文件」），不单独挂「设置」菜单。
- 配置盖在 Chat 上的模态：有未保存改动时关闭需确认。
- 快捷键：`prefs.shortcuts`（缺省=内置默认；`""`=无加速键仍可点菜单；非空=Wails accelerator）。设置 UI 可**清除 / 按行恢复默认 / 点击录制改键**（未改键时点击空白取消录制；`SetShortcuts` → 校验冲突 → `rebuildApplicationMenu`）。默认：⌘, / Ctrl+, 打开设置；⌘W / Ctrl+W 关闭/隐藏 Chat（`CloseChatToTray`：绑定存在时始终隐藏；仅 `trayEnabled` 时进托盘，否则回程序坞/任务栏；**不** `RequestQuit`）；⌘Q / Ctrl+Q 退出；macOS ⌘H / ⌥⌘H 系统隐藏（保留 `SetRole`）。窗口 **X** 才遵循 `closeToTray`。勿使用 Wails `CloseWindow` role（其会 `Close()` 而非藏托盘）。
- 托盘相关三项：`trayEnabled`（总开关，默认 false）、`traySessionLimit`（任务显示数量）、`closeToTray`（关闭窗口到托盘；依赖 `trayEnabled`）。关闭总开关时后两项不可用，并会关掉 `closeToTray`、销毁托盘。开启总开关后创建托盘图标；仅当 `closeToTray` 开启时 **X** 关窗隐藏到托盘。⌘Q / Ctrl+Q / 托盘「退出」仍走 `RequestQuit`。⌘W / Ctrl+W 始终隐藏窗口；仅在 `trayEnabled` 时才会创建/使用托盘图标，否则回到程序坞/任务栏。旧配置仅有 `closeToTray=true` 时会迁移为同时开启 `trayEnabled`。托盘菜单可列出最近会话（`traySessionLimit`，默认 5，0 隐藏；数据来自 Chat `sessions.list` 经 `/v1/report-sessions`）。会话状态：空闲标题不加前缀（与菜单其它项左对齐）；运行中/出错用标题前缀 `🟢`/`🔴`（via `traySessionMenuLabel`）。**不要**给空闲项加 em 空格占位，也**不要**对会话行 `SetBitmap`（与 emoji 混用会导致 macOS status 菜单错位）。菜单栏角标仍为翠绿 `#10B981`；粘性错误语义不变（`api-session/error` 与 `turn/end` 的 `error`/`interrupted`；`aborted` 不算；再次 running、成为当前会话、或点击该菜单项可清除）；tooltip 保留「运行中」/「错误」。`selectTraySessions` 优先 running → error → `UpdatedAt`，保证活跃会话落在 `traySessionLimit` 内；**过滤 `SessionSummary.blank` 空会话**（Chat 空日志「新会话」；`displayTitle` 会回退成工作区目录名，例如 `dsh-sol-pi`）。点击最近会话：先 `revealChatFromTray`，再走 DSH 官方导航 `ctx.uiWorkspace.openSession(id)`（内部 `sessions.open` + `layout.selectPanel(null)`，从设置页回到会话）。热路径：WebView `CustomEvent("dsh-desktop-open-session")`；冷启动：pending id 经 `/v1/claim-open-session` 由 bridge client `apply()` 领取，并在 `sessions.list` 就绪后重试导航；页面初始化后保留退避 claim 轮询（首次 500ms，空闲最多 10s），兜底漏掉的 WebView 事件。关窗钩子同时绑定 Common + 各端原生事件（darwin `WindowShouldClose` / windows `WindowClosing` / linux `WindowDeleteEvent`）；`ApplicationShouldTerminateAfterLastWindowClosed` 固定为 false，避免 Hide/关最后一窗误杀进程。Linux 托盘依赖桌面环境的 StatusNotifier / AppIndicator。
- Chat 窗口拖拽：macOS 用 `InvisibleTitleBarHeight` 原生拖条；Windows/Linux 用自绘 `--wails-draggable: drag` 顶栏（窗控 `no-drag`）。**已取消**顶栏双击放大/还原（命中带与原生拖拽冲突，且易挡工具栏按钮）。Win/Linux 仍可通过窗控「最大化」走 `ToggleChatZoom`。

## 跨平台

本仓库是 **跨平台开源** 项目（macOS / Windows / Linux）。功能新增或修复必须默认考虑多端影响：

- **功能尽量一致**：同一用户目标在三端都应可达；不要只在某一端“悄悄少做”或行为分叉到用户感知不一致。
- **允许端侧优化**：可为各端做原生体验与实现优化（菜单角色、窗控、签名、进程模型、WebView 差异等），优先通过 `*_darwin.go` /
  `*_windows.go` / `*_linux.go` 或小范围分支隔离，而不是复制整条业务路径。
- **共享内核优先**：生命周期、发现 CLI、桥接控制面、webview boot、配置模型放在 `internal/dsh` 等无 UI 层；平台差异下沉到薄适配层。
- **改动自检**：触及进程、窗口、菜单、打包、WebView、更新时，想一遍三端；测不了的端在 PR/说明里标出风险，而不是默认“本机 OK 即可”。
- **发版矩阵**：Release 打 darwin-arm64、darwin-amd64、linux-amd64、linux-arm64、windows-amd64、windows-arm64（macOS Intel 用原生 amd64 包）；改构建脚本或 workflow 时保持矩阵都能产出。

## 国际化

支持语言：`zh-CN`、`en`、`de`、`fr`、`es`、`ja`、`ko`、`pt`。

解析顺序：

1. 用户在配置页保存的 `language`（`desktop-state.json`（prefs 段）；空 / `system` = 跟随系统）
2. 否则映射 OS/系统语言（`LANG`/`LC_ALL`，macOS `AppleLocale`，Windows `GetUserDefaultLocaleName`）到支持列表
3. 否则回退 `en`

目录：`internal/i18n/locales/*.json`（扁平 key；英文为源，zh-CN 对齐壳 UI）。Web 壳通过 `LocaleBundle` / `SetLanguage` 加载目录并用 `data-i18n` / `t()` 刷新。

进程级 Active 语言：`i18n.SetActive` / `Active` / `TActive`（及 `ErrorfActive`）。默认 `en`；桌面在 prefs 解析后与 `SetLanguage` 时调用 `SetActive`。`internal/dsh`、`internal/update`、`internal/desktop` 的用户可见错误/状态/桥接响应体/窗口控制条 title 经 `TActive` 取文案。稳定协议哨兵仍用语言无关字段（例如 CheckCLI 的 `alreadyRunning`）；日志凭据脱敏标记固定为 `?[credentials-redacted]`。assets 中展开/收起等 CSS 文案经 `data-i18n-expand`/`data-collapse` + catalog。

## 版本与发版

基线： **0.1.0**（git tag `v0.1.0`）。当前最新发布见 git tag / GitHub Releases。

| 变更类型           | 版本怎么动          | 例子              |
|--------------------|---------------------|-------------------|
| 小 bugfix、小特性  | 补丁号 +1           | `0.1.0` → `0.1.1` |
| 较大改动或重要修复 | 次版本 +1，补丁归 0 | `0.1.3` → `0.2.0` |

开发构建版本号（未显式传 `VERSION` / 参数时，由 `scripts/app-version.sh` 决定）：

- 正好停在某个 release tag 上 → 正式号，如 `0.1.1`
- 其它提交 → **最新发布号 + `-dev`**，如 `0.1.1-dev`
- 仓库尚无 tag → `0.0.0-dev`
- Release CI 仍从 tag 注入正式号（如 `0.1.1`），不会带 `-dev`

流程：

1. 改动合入 **main**。
2. 在 main 尖端打 annotated tag：`git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`。
3. `.github/workflows/release.yml` 校验 tag 祖先在 `origin/main`，用 `scripts/build.sh` 打 darwin-arm64 / darwin-amd64 / linux-amd64 / linux-arm64 /
   windows-amd64 / windows-arm64，上传制品并创建 GitHub Release（含 `SHA256SUMS`）。
4. **不必**为发版改 `internal/version.Version`；CI/脚本用 ldflags 写入。

不在 main 上的 tag 会被 workflow 拒绝。自签名非 Developer ID / EV，未公证。

## 开发命令

常用入口（完整说明见「构建与测试（细节）」）：

```bash
go test -race ./...
go test -race -tags wails ./...
./scripts/build.sh            # 省略参数 → 如 0.1.1-dev
./scripts/build.sh 0.1.1     # 显式正式号
GOOS=darwin GOARCH=arm64 ./scripts/build.sh 0.1.1
```

依赖：Go 1.27、目标平台 WebView（macOS Xcode / Linux GTK4+WebKitGTK6 / Windows WebView2）。


## 仓库布局

| 路径 | 说明 |
|------|------|
| `main.go` | Wails 入口、资源嵌入、`main.DSH.*` 绑定 |
| `internal/dsh` | 进程生命周期、CLI 发现、回环控制面（无 Wails 依赖） |
| `internal/desktop` | 窗口、菜单、托盘、快捷键、文件对话框、prefs |
| `internal/desktopstate` | `desktop-state.json` 冷配置 |
| `internal/i18n` | 嵌入 locales、T / TActive |
| `internal/update` | GitHub Release 检查与安装 |
| `internal/version` | `Version` 默认 `"dev"`；构建用 ldflags / `app-version.sh` 戳号 |
| `assets/web` | 配置页 UI |
| `assets/shared` | 跨平台图标源（`app-icon.svg`） |
| `assets/{darwin,linux,windows}` | 各平台打包输入 |
| `internal/dsh/desktopbridge` | 内置桌面桥接（`--patch` 覆盖） |
| `internal/dsh/webviewboot*` | WKWebView combo / HTTP 431 补丁 |
| `dist/` | 构建产物（git 忽略） |
| `scripts/` | `build.sh`、签名、版本、DMG 等 |
| `Makefile` | `test` / `build` / `darwin-build` / `icons` 等入口 |

## 桥接插件（实现要点）

- 每次由本应用拉起的 `dsh web` 经 Cordis `--patch` 注入 `desktop-bridge`（与 `webview-boot` 同类），**不改用户 profile**。
- Chat「设置 → 桌面设置」注册为 `settings.section`（一级导航）。
- 控制面仅 `127.0.0.1`；白名单 RPC + 随机令牌（常量时间比较）；令牌不进页面 / 日志 / 状态 JSON；无任意 shell。
- 监听异常退出时重建（新令牌）并写 endpoint 文件供插件重连。
- 不必再 `dsh plugin --profile web add file:…`；若残留 profile 副本，内置 patch 会移除同 id。

## 构建与测试（细节）

依赖：Go 1.27、Wails 3，目标平台 WebView（macOS Xcode；Linux GTK 4 / WebKitGTK 6；Windows WebView2）。Node.js 可选，仅用于 `make test` 的 desktop-bridge replay；未安装时该项明确跳过。

```bash
make test
make build                      # 如 0.1.4-dev
make build VERSION=0.1.4
./scripts/build.sh 0.1.4
make darwin-build VERSION=0.1.4
make linux-build GOARCH=amd64 VERSION=0.1.4
make windows-build GOARCH=amd64 VERSION=0.1.4
```

版本戳入 `internal/version.Version`（`scripts/app-version.sh`）：

- 显式参数 / `VERSION=` → 照用
- HEAD 正好在 release tag → 正式号
- 其它提交 → 最新发布号 + `-dev`
- 尚无 tag → `0.0.0-dev`

产物在 `dist/`。macOS 额外生成 DMG。构建按平台自签名（非 Developer ID / EV，未公证）：

- macOS：ad-hoc `codesign` + DMG
- Windows：当前用户自签 Authenticode
- Linux：写出 `.sha256`

图标源：`assets/shared/app-icon.svg`；生成物已提交，**日常 `make build` 不重跑**。改源图后：`make icons`。

未在目标机实测的交叉组合不宣称已验收。

## 给助手的约束

- 推送默认只到用户 fork 远程（当前为 `xinghaix/deepseek-harness-desktop`）；未明确要求不要对 upstream 开 PR。
- 改 DSH 生命周期、锁、桥接令牌、webview boot 时保持「只管理自己拉起的进程树」。
- 桥接控制面仅 `127.0.0.1`，无任意 shell；令牌不进页面/日志/状态 JSON。
- 增量改动保持可测：`internal/dsh` 尽量无 Wails 依赖；桌面行为用 `internal/desktop` 测试与契约。
- 跨平台：功能一致优先，允许端侧优化；改动默认评估 macOS / Windows / Linux 影响。
- 改 UI 文案时同步更新 `internal/i18n/locales` 全部语言，并保持 key 集合与 `en.json` 一致。
- 发版相关只动 tag + 已有 workflow/脚本；避免再引入易触发 GitHub API 限流的第三方 setup action 装 `task`。
- 完成会改变运行中桌面端的改动后，在本机执行 `make build`（当前 GOOS/GOARCH，产物 `dist/`），不必等用户再叫打包。纯文档 / 纯测试且不影响二进制的改动可跳过。
