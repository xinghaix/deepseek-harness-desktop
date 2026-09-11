# Deepseek Harness Desktop

Deepseek Harness Desktop 是 DSH 的轻量桌面伴侣：复用用户已经安装的 `dsh` CLI 和现有 DSH Home，在自己的桌面 WebView 中运行 DSH Chat。它不会复制 DSH、下载第二份 CLI、迁移配置或接管其他进程。

## 首次启动

1. 启动 Deepseek Harness Desktop。首页会先检查用户目录、登录 shell 的 PATH 和常见的 Node 全局目录；GUI 启动时也会把这些路径传给 CLI 子进程。
2. 找到 dsh 后会自动启动并打开 DSH Chat；如果没有找到，才会进入配置页。配置完成后会打开 Chat 并关闭当前配置窗口。
3. 如果需要调整 `DSH Home`、Chat 工作目录或本机端口，可从应用菜单（macOS）或「文件」菜单（Windows / Linux）、Chat 顶部的设置按钮或桥接插件重新打开配置页。端口 `0` 表示由操作系统分配 loopback 空闲端口。
4. 配置成功后会保存最后一次成功启动配置；下次冷启动优先直接启动 DSH，跳过重复 CLI 检查。配置页仍可修改路径和端口，修改后重新检测或启动即可覆盖保存配置。
5. 如果 DSH 启动失败，配置页会显示 DSH 返回的错误信息，并允许复制已脱敏的完整错误日志；修复问题后点击“重试启动”会重新检测 CLI 并启动新的 DSH 进程。
6. 配置页和 Chat 使用跟随系统深浅色主题的界面；macOS 使用原生 traffic lights，Chat 使用与交通灯安全区对齐的 DSH 原生 84px 折叠轨道，标题栏安全区只留给左侧 sidebar；Windows/Linux 使用融合页面的悬浮窗口控制并为页面内容预留安全空间，不会跳转到系统默认浏览器。

首页还提供可选的桌面管理桥接插件安装提示。安装后，在 DSH Chat 的「设置 → 插件 → 桌面管理」中可以查看状态、启动、停止和重启由本桌面端拥有的 DSH 进程。

## 仓库布局

- `main.go`：Wails 入口、资源嵌入和 `main.DSH.*` 绑定包装
- `internal/dsh`：DSH 进程生命周期、CLI 发现和回环控制面（不依赖 Wails）
- `internal/desktop`：窗口、标题栏注入和文件对话框
- `assets/web`：配置页；`assets/shared`：跨平台图标源；`assets/{darwin,linux,windows}`：各平台打包输入
- `plugins/deepseek-harness-desktop-bridge`：可选桌面管理桥接插件
- `dist/`：编译打包产物（git 忽略）
- `scripts/sign.sh`：跨平台自签名入口

## 桥接插件

插件源码位于 [`plugins/deepseek-harness-desktop-bridge`](plugins/deepseek-harness-desktop-bridge)。在项目根目录执行：

```sh
dsh plugin --profile web add file:./plugins/deepseek-harness-desktop-bridge
```

插件通过 DSH 已认证的 RPC 连接调用桌面端仅监听 `127.0.0.1` 的有限控制面。桌面端为每次运行生成随机令牌，只向自己启动的 DSH 子进程注入令牌；令牌不会显示在页面、日志或状态响应中，也没有任意 shell 执行接口。

## 构建与测试

需要 Go 1.27、Wails 3 和目标平台的原生 WebView 构建依赖。不必安装 `task`，直接：

```bash
go test -race ./...
./scripts/build.sh 0.2.0
```

版本会写进 `internal/version.Version`。省略参数时用最近的 git tag，没有 tag 则为 `dev`。如果要用 Taskfile，先安装 [go-task](https://taskfile.dev)：`brew install go-task`，然后 `task build VERSION=0.2.0`。

产物输出到 `dist/`（已 git 忽略）。macOS 还会额外生成 `dist/deepseek-harness-desktop-darwin-<arch>.dmg`（应用 + Applications 快捷方式，打开后拖进去即可安装）。`task build` 会按当前平台做自签名，同一套脚本在 macOS / Linux / Windows 上都能跑：

- macOS：对 `.app` 做 ad-hoc `codesign`（`scripts/sign-darwin.sh`），并生成可拖到 Applications 的安装 DMG
- Windows：用当前用户存储里的自签代码签名证书做 Authenticode（`scripts/sign-windows.ps1`）
- Linux：写出 `.sha256` 校验和；系统没有等价的代码签名 API

已安装的应用可在配置页手动检查 GitHub Release；也可开启「每天自动检查更新」（启动约 1 小时后首次检查，之后大约每天一次）。发现新版本后不会自动安装。运行时版本来自 Go 变量 `internal/version.Version`，由构建注入；发布时只需打 `vX.Y.Z` tag，不必改源码。

这不是 Apple Developer ID / Microsoft EV 签名，也未经公证。从网上下载后，macOS 仍可能需要右键「打开」，Windows 仍可能被 SmartScreen 拦截。

指定目标架构时：

```bash
GOOS=windows GOARCH=amd64 ./scripts/build.sh 0.2.0
GOOS=darwin GOARCH=arm64 ./scripts/build.sh 0.2.0
GOOS=linux GOARCH=amd64 ./scripts/build.sh 0.2.0
```

Linux 构建需要 GTK 4 / WebKitGTK 6，macOS 构建需要 Xcode，Windows 构建使用 WebView2。未在目标系统实际构建或运行的组合，不宣称已验收。

### 图标资源

`assets/shared/app-icon.svg` 是统一的 1024×1024 方形主素材，已去掉外层 border；鲸鱼在所有输出中使用同一组 optical bounding box。Windows 的 ICO、Linux 的 hicolor SVG/16–512px PNG 使用主素材；macOS 使用 `assets/darwin/app-icon.png` 和对应 ICNS，在同一几何上额外保留 10% 透明边距，以匹配 Dock 中其他应用的视觉重量。

在目标平台的原生 Go 环境中执行下面的命令即可重新生成全部图标；macOS 的 ICNS 使用可移植的 ICNS 编码器生成，不依赖手工维护二进制文件：

```bash
go run ./tools/icons
```

Linux 安装包可使用 `assets/linux/deepseek-harness-desktop.desktop`，并将 `assets/linux/icons/hicolor` 安装到系统的 icon theme 目录。

### 发布

只对 **main 上的版本 tag** 打包。在已经合入 main 的提交上打 `vX.Y.Z` 并推送后，GitHub Actions（`.github/workflows/release.yml`）会在 darwin/linux/windows 上构建并自签名，然后创建 GitHub Release（含 SHA256SUMS）。

版本约定（从 `0.1.0` 起）：

- 小 bugfix / 小特性：升补丁号（`0.1.1`、`0.1.2`…）
- 较大改动或重要修复：升次版本号，补丁归零（`0.2.0`、`0.3.0`…）

```bash
git tag v0.1.0
git push origin v0.1.0
```

不在 main 上的 tag 会被 workflow 拒绝。运行时版本由构建 `-ldflags` 从 tag 注入，不必改 `internal/version.Version`。

## 数据与进程边界

桌面端只向子进程显式传入 `DSH_HOME`，并在该目录下预留固定的桌面端专属目录 `DSH_HOME/.deepseek-harness-desktop`；首次启动时按 0700 权限创建，但它不作为 DSH 的当前目录。启动 DSH 时会为 Node 子进程抬高 max-http-header-size，并写入仅作用于本次进程的 `--patch` 覆盖（`webview-boot`）：用一次 XHR 加载 client combo（遇 431 再并发拉单包），不修改用户 profile。Chat 的 workspace 仍是独立、可配置的 DSH `cwd`，默认沿用系统用户目录，也可以选择项目目录或桌面端专属目录。桌面端通过单实例应用锁、跨进程 DSH 锁、生命周期串行化和进程标记，确保同一用户下同一时刻只有一个由桌面端拥有的 DSH；重复打开配置或 Chat 只复用已有窗口，不重复刷新或启动 CLI。异常退出时会清理自己拥有的整个进程树；在进程树未确认退出前禁止再次启动。Windows 使用 Job Object 的关闭即回收策略，并以 `taskkill /T` 作为兼容性兜底；Unix 使用独立进程组。桌面端不会递归扫描任一 workspace，不会读取或重写凭据，也不会生成第二份 YAML。`settings.yaml` 入口只打开用户已经存在的文件。端口被占用时直接失败，不接管或停止其他进程。
