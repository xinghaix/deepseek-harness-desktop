# AGENTS.md — Deepseek Harness Desktop

给在本仓库工作的编码助手用的项目说明。人类可读总览仍以 `README.md` 为准；这里偏架构、边界和发版约定。

## 产品定位

轻量桌面伴侣：复用用户 **已安装**的 `dsh` CLI 与现有 DSH Home，在本应用的桌面 WebView 中打开 DSH Chat。

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
│  │ 127.0.0.1 桥接 HTTP │                                │
│  └─────────┬──────────┘                                 │
│            │ 仅注入给自己拉起的子进程                     │
└────────────┼────────────────────────────────────────────┘
             ▼
      本机 dsh CLI  ──►  DSH Cordis Host + client-modules
             ▲
             │ 可选：plugins/deepseek-harness-desktop-bridge
             └──── 经已认证 RPC 调桌面回环控制面（令牌不落日志）
```

分层：

| 层           | 路径                                      | 职责                                                                                                                                   |
|--------------|-------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| 入口         | `main.go`                                 | Wails 应用、资源嵌入、单实例、`main.DSH` 服务包装、宿主菜单                                                                            |
| 桌面 UI      | `internal/desktop`                        | 配置窗 / Chat 窗、标题栏与安全区、文件对话框、配置模态、菜单动作；依赖 Wails                                                           |
| DSH 内核     | `internal/dsh`                            | CLI 发现、启动/停止、进程组或 Job Object、全局锁与 owned-process 标记、回环桥接；**不依赖 Wails**，便于单测                            |
| WebView boot | `internal/dsh/webviewboot*`               | 每次启动写入 `DSH_HOME/.deepseek-harness-desktop/webview-boot/` 的一次性 `--patch`；解决 WKWebView 长 combo `/plugins/??…` 与 HTTP 431 |
| 更新         | `internal/update`                         | 查 GitHub Release、下载、平台 apply；不自动静默安装                                                                                    |
| 版本         | `internal/version`                        | `Version` 默认 `"dev"`；发布包用 `-ldflags` 从 tag 注入                                                                                |
| 桥接插件     | `plugins/deepseek-harness-desktop-bridge` | 可选 DSH profile bundle，在 Chat 里暴露桌面管理 UI                                                                                     |
| 构建         | `scripts/build.sh`、`Taskfile.yml`        | 本地/CI 打包与自签名；CI 优先 `scripts/build.sh`                                                                                       |

### 进程与数据边界

- 显式传入 `DSH_HOME`；桌面专属目录：`DSH_HOME/.deepseek-harness-desktop`（0700），不是 DSH cwd。
- Chat workspace 独立可配，默认用户目录。
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
- 宿主菜单承载「打开配置 / 打开 Chat / 退出」等（macOS 应用菜单；Win/Linux「文件」），不单独挂「设置」菜单。
- 配置盖在 Chat 上的模态：有未保存改动时关闭需确认。

## 跨平台

本仓库是 **跨平台开源** 项目（macOS / Windows / Linux）。功能新增或修复必须默认考虑多端影响：

- **功能尽量一致**：同一用户目标在三端都应可达；不要只在某一端“悄悄少做”或行为分叉到用户感知不一致。
- **允许端侧优化**：可为各端做原生体验与实现优化（菜单角色、窗控、签名、进程模型、WebView 差异等），优先通过 `*_darwin.go` /
  `*_windows.go` / `*_linux.go` 或小范围分支隔离，而不是复制整条业务路径。
- **共享内核优先**：生命周期、发现 CLI、桥接控制面、webview boot、配置模型放在 `internal/dsh` 等无 UI 层；平台差异下沉到薄适配层。
- **改动自检**：触及进程、窗口、菜单、打包、WebView、更新时，想一遍三端；测不了的端在 PR/说明里标出风险，而不是默认“本机 OK 即可”。
- **发版矩阵**：Release 打 darwin-arm64、darwin-amd64、linux-amd64、windows-amd64；改构建脚本或 workflow 时保持四者都能产出。

## 版本与发版

基线： **0.1.0**（git tag `v0.1.0`）。

| 变更类型           | 版本怎么动          | 例子              |
|--------------------|---------------------|-------------------|
| 小 bugfix、小特性  | 补丁号 +1           | `0.1.0` → `0.1.1` |
| 较大改动或重要修复 | 次版本 +1，补丁归 0 | `0.1.3` → `0.2.0` |

流程：

1. 改动合入 **main**。
2. 在 main 尖端打 annotated tag：`git tag -a vX.Y.Z -m "…" && git push origin vX.Y.Z`。
3. `.github/workflows/release.yml` 校验 tag 祖先在 `origin/main`，用 `scripts/build.sh` 打 darwin-arm64 / darwin-amd64 /
   linux-amd64 / windows-amd64，上传制品并创建 GitHub Release（含 `SHA256SUMS`）。
4. **不必**为发版改 `internal/version.Version`；CI/脚本用 ldflags 写入。

不在 main 上的 tag 会被 workflow 拒绝。自签名非 Developer ID / EV，未公证。

## 开发命令

```bash
go test -race ./...
go test -race -tags wails ./...
./scripts/build.sh 0.1.1 # 或省略参数：最近 tag / dev
GOOS=darwin GOARCH=arm64 ./scripts/build.sh 0.1.1
```

依赖：Go 1.27、目标平台 WebView（macOS Xcode / Linux GTK4+WebKitGTK6 / Windows WebView2）。

## 给助手的约束

- 推送默认只到用户 fork 远程（当前为 `xinghaix/deepseek-harness-desktop`）；未明确要求不要对 upstream 开 PR。
- 改 DSH 生命周期、锁、桥接令牌、webview boot 时保持「只管理自己拉起的进程树」。
- 桥接控制面仅 `127.0.0.1`，无任意 shell；令牌不进页面/日志/状态 JSON。
- 增量改动保持可测：`internal/dsh` 尽量无 Wails 依赖；桌面行为用 `internal/desktop` 测试与契约。
- 跨平台：功能一致优先，允许端侧优化；改动默认评估 macOS / Windows / Linux 影响。
- 发版相关只动 tag + 已有 workflow/脚本；避免再引入易触发 GitHub API 限流的第三方 setup action 装 `task`。
