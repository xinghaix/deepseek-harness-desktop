# Deepseek Harness Desktop

Deepseek Harness Desktop 是 DSH 的轻量桌面伴侣：复用用户已经安装的 `dsh` CLI 和现有 DSH Home，在自己的桌面 WebView 中运行 DSH Chat。它不会复制 DSH、下载第二份 CLI、迁移配置或接管其他进程。

## 首次启动

1. 启动 Deepseek Harness Desktop。首页会先检查用户目录、登录 shell 的 PATH 和常见的 Node 全局目录；GUI 启动时也会把这些路径传给 CLI 子进程。
2. 找到 dsh 后会自动启动并打开 DSH Chat；如果没有找到，才会进入配置页。配置完成后会打开 Chat 并关闭当前配置窗口。
3. 如果需要调整 `DSH Home`、Chat 工作目录或本机端口，可从桌面菜单、Chat 顶部的设置按钮或桥接插件重新打开配置页。端口 `0` 表示由操作系统分配 loopback 空闲端口。
4. 配置成功后会保存最后一次成功启动配置；下次冷启动优先直接启动 DSH，跳过重复 CLI 检查。配置页仍可修改路径和端口，修改后重新检测或启动即可覆盖保存配置。
5. 如果 DSH 启动失败，配置页会显示 DSH 返回的错误信息，并允许复制已脱敏的完整错误日志；修复问题后点击“重试启动”会重新检测 CLI 并启动新的 DSH 进程。
6. 配置页和 Chat 使用跟随系统深浅色主题的界面；macOS 使用原生 traffic lights，Chat 默认使用与交通灯安全区对齐的 84px 折叠轨道（配置页可选启用主区横向操作胶囊），标题栏安全区只留给左侧 sidebar；Windows/Linux 使用融合页面的悬浮窗口控制并为页面内容预留安全空间，不会跳转到系统默认浏览器。

首页还提供可选的桌面管理桥接插件安装提示。安装后，在 DSH Chat 的「设置 → 插件 → 桌面管理」中可以查看状态、启动、停止和重启由本桌面端拥有的 DSH 进程。

## 桥接插件

插件源码位于 [`plugins/deepseek-harness-desktop-bridge`](plugins/deepseek-harness-desktop-bridge)。在项目根目录执行：

```sh
dsh plugin --profile web add file:./plugins/deepseek-harness-desktop-bridge
```

插件通过 DSH 已认证的 RPC 连接调用桌面端仅监听 `127.0.0.1` 的有限控制面。桌面端为每次运行生成随机令牌，只向自己启动的 DSH 子进程注入令牌；令牌不会显示在页面、日志或状态响应中，也没有任意 shell 执行接口。

## 构建与测试

需要 Go 1.27、Wails 3 和目标平台的原生 WebView 构建依赖。项目的 `Taskfile.yml` 会自动加入 `wails` build tag：

```bash
go test -race ./...
task build
```

也可以直接使用 Wails：

```bash
wails3 build
```

在 macOS 上，构建任务会同时生成 `bin/deepseek-harness-desktop.app`；将该目录压缩或制作 DMG 后即可分发。当前应用包未进行开发者签名和公证。

指定目标架构时：

```bash
GOOS=windows GOARCH=amd64 wails3 build
GOOS=darwin GOARCH=arm64 wails3 build
GOOS=linux GOARCH=amd64 wails3 build
```

Linux 构建需要 GTK 4 / WebKitGTK 6，macOS 构建需要 Xcode，Windows 构建使用 WebView2。未在目标系统实际构建或运行的组合，不宣称已验收。

### 图标资源

`assets/dsh-app-icon.svg` 是统一的 1024×1024 方形主素材，已去掉外层 border；鲸鱼在所有输出中使用同一组 optical bounding box。Windows 的 ICO、Linux 的 hicolor SVG/16–512px PNG 使用主素材；macOS 使用 `assets/dsh-app-icon-macos.png` 和对应 ICNS，在同一几何上额外保留 10% 透明边距，以匹配 Dock 中其他应用的视觉重量。旧的 `dsh-favicon.svg/png` 保留为兼容路径，并与主素材保持一致。

在目标平台的原生 Go 环境中执行下面的命令即可重新生成全部图标；macOS 的 ICNS 使用可移植的 ICNS 编码器生成，不依赖手工维护二进制文件：

```bash
go run ./tools/icons
```

Linux 安装包可使用 `build/linux/deepseek-harness-desktop.desktop`，并将 `build/linux/icons/hicolor` 安装到系统的 icon theme 目录。

## 数据与进程边界

桌面端只向子进程显式传入 `DSH_HOME`，并在该目录下预留固定的桌面端专属目录 `DSH_HOME/.deepseek-harness-desktop`；首次启动时按 0700 权限创建，但它不作为 DSH 的当前目录。Chat 的 workspace 仍是独立、可配置的 DSH `cwd`，默认沿用系统用户目录，也可以选择项目目录或桌面端专属目录。桌面端通过单实例应用锁、跨进程 DSH 锁、生命周期串行化和进程标记，确保同一用户下同一时刻只有一个由桌面端拥有的 DSH；重复打开配置或 Chat 只复用已有窗口，不重复刷新或启动 CLI。异常退出时会清理自己拥有的整个进程树；在进程树未确认退出前禁止再次启动。Windows 使用 Job Object 的关闭即回收策略，并以 `taskkill /T` 作为兼容性兜底；Unix 使用独立进程组。桌面端不会递归扫描任一 workspace，不会读取或重写凭据，也不会生成第二份 YAML。`settings.yaml` 入口只打开用户已经存在的文件。端口被占用时直接失败，不接管或停止其他进程。
