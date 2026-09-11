# Deepseek Harness Desktop

[English](README.en.md) · 中文

Deepseek Harness Desktop 是 DSH 的轻量桌面客户端：复用本机已安装的 `dsh` CLI 与现有 DSH Home，在桌面 WebView 中打开 DSH Chat。它不复制 DSH、不另装 CLI、不迁移配置，也不接管其他进程。

更细的架构与边界见 [AGENTS.md](AGENTS.md)。

## 首次启动

1. 启动后检查用户目录、登录 shell 的 `PATH` 和常见 Node 全局目录，并把这些路径传给 CLI 子进程。
2. 找到 `dsh` 后自动启动并打开 Chat；找不到则进入配置页，配置成功后打开 Chat 并关闭配置窗。
3. 需要改 `DSH Home`、Chat 工作目录或本机端口时，可从应用菜单（macOS）/「文件」菜单（Windows、Linux）、Chat 顶部设置，或 Chat 内「桌面设置」再开配置页。端口 `0` 表示由系统分配空闲 loopback 端口。
4. 成功启动后会记住配置；下次冷启动优先直接起 DSH。配置页仍可改路径与端口并重新检测。
5. 启动失败时配置页展示已脱敏错误，可复制完整日志；修好后点「重试启动」。
6. 界面跟随系统深浅色。macOS 用原生 traffic lights，Chat 对齐 DSH 折叠轨道；Windows / Linux 用页面内悬浮窗控，不跳系统浏览器。

桌面管理桥接已内置：每次由本应用拉起的 `dsh web` 都会通过 `--patch` 注入。在 DSH Chat「设置 → 桌面设置」查看状态，以及启动 / 停止 / 重启**本桌面端拥有**的 DSH 进程。

## 仓库布局

| 路径 | 说明 |
|------|------|
| `main.go` | Wails 入口、资源嵌入、`main.DSH.*` 绑定 |
| `internal/dsh` | 进程生命周期、CLI 发现、回环控制面（无 Wails 依赖） |
| `internal/desktop` | 窗口、标题栏注入、文件对话框 |
| `assets/web` | 配置页 |
| `assets/shared` | 跨平台图标源 |
| `assets/{darwin,linux,windows}` | 各平台打包输入 |
| `internal/dsh/desktopbridge` | 内置桌面桥接（`--patch` 覆盖） |
| `dist/` | 构建产物（git 忽略） |
| `scripts/` | 构建、签名、版本号等脚本 |

## 桥接插件（已内置）

桌面端每次启动自己拥有的 `dsh web` 时，会经 Cordis `--patch` 注入内置桥接（源码：[`internal/dsh/desktopbridge/`](internal/dsh/desktopbridge/)），
与 `webview-boot` 同类，**不改用户 profile**。在 DSH Chat 打开「设置 → 桌面设置」（设置左侧一级导航）即可管理本桌面端拉起的 DSH。

不必再执行 `dsh plugin --profile web add file:./plugins/...`。若以前装过 profile 副本，内置 patch 会移除同 id；也可手动 `dsh plugin --profile web remove @deepseek-ai/deepseek-harness-desktop-bridge`。

控制面仅监听 `127.0.0.1`，白名单 RPC + 随机令牌（常量时间比较）；令牌不进页面、日志或状态 JSON，也没有任意 shell 端点。监听异常退出时会重建（新令牌）并写入端点文件供插件重连。


## 构建与测试

需要 Go 1.27、Wails 3，以及目标平台原生 WebView 依赖（macOS：Xcode；Linux：GTK 4 / WebKitGTK 6；Windows：WebView2）。不必安装 `task`：

```bash
go test -race ./...
./scripts/build.sh              # 例如 0.1.1-dev
./scripts/build.sh 0.2.0        # 显式版本
```

版本写入 `internal/version.Version`（见 `scripts/app-version.sh`）：

- 显式参数 / `VERSION=` → 照用
- HEAD 正好在 release tag → 正式号（如 `0.1.1`）
- 其它提交 → 最新发布号 + `-dev`（如 `0.1.1-dev`）
- 尚无 tag → `0.0.0-dev`

也可用 [go-task](https://taskfile.dev)：`task build VERSION=0.2.0`。

产物在 `dist/`。macOS 会额外生成可拖入 Applications 的 DMG。构建会按平台自签名（非 Developer ID / EV，未公证；下载后 macOS 可能需右键打开，Windows 可能被 SmartScreen 拦截）：

- macOS：ad-hoc `codesign` + DMG
- Windows：当前用户自签 Authenticode
- Linux：写出 `.sha256`（无等价代码签名 API）

交叉编译示例：

```bash
GOOS=darwin GOARCH=arm64 ./scripts/build.sh 0.2.0
GOOS=linux GOARCH=amd64 ./scripts/build.sh 0.2.0
GOOS=linux GOARCH=arm64 ./scripts/build.sh 0.2.0
GOOS=windows GOARCH=amd64 ./scripts/build.sh 0.2.0
GOOS=windows GOARCH=arm64 ./scripts/build.sh 0.2.0
```

未在目标机实际构建或运行的组合，不宣称已验收。

配置页可手动检查 GitHub Release，也可开启「每天自动检查更新」（约启动 1 小时后首次，之后约每天一次）。发现新版本后**不会**自动安装。

### 图标

统一源：`assets/shared/app-icon.svg`。在目标平台原生 Go 环境重生成：

```bash
go run ./tools/icons
```

Linux 可用 `assets/linux/deepseek-harness-desktop.desktop`，并把 `assets/linux/icons/hicolor` 装到系统 icon theme。

### 发布

只对 **main 上的版本 tag** 打包。在已合入 main 的提交上：

```bash
git tag -a vX.Y.Z -m "…"
git push origin vX.Y.Z
```

GitHub Actions（`.github/workflows/release.yml`）构建并自签名 **darwin-arm64 / linux-amd64 / linux-arm64 / windows-amd64 / windows-arm64**，创建含 `SHA256SUMS` 的 Release。不在 main 上的 tag 会被拒绝。运行时版本由 `-ldflags` 从 tag 注入，不必改源码。

版本约定（基线 `0.1.0`）：

- 小 bugfix / 小特性 → 升补丁（`0.1.1`…）
- 较大改动或重要修复 → 升次版本、补丁归零（`0.2.0`…）

## 数据与进程边界（摘要）

- 只向子进程显式传入 `DSH_HOME`；桌面专属目录为 `DSH_HOME/.deepseek-harness-desktop`（0700），不作为 DSH 的 cwd。
- Chat workspace 可配置，默认用户目录；可选用项目目录或上述专属目录。
- 单实例应用锁 + DSH 锁：同一用户同时只有一个本端拥有的 DSH；重复打开只复用窗口。
- 异常退出清理自有进程树；未确认退出前禁止再启。Windows 用 Job Object（`taskkill /T` 兜底），Unix 用独立进程组。
- 不扫 workspace、不读写凭据、不另写 YAML；`settings.yaml` 只打开已存在文件。端口占用则失败，不接管他人进程。
- 启动时抬高 Node `max-http-header-size`，并用本次进程的 `--patch`（`webview-boot`）优化 client combo 加载，不改用户 profile。

细节见 [AGENTS.md](AGENTS.md)。
