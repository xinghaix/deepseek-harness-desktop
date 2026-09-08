# Deepseek Harness Desktop

Deepseek Harness Desktop 是 DSH 的轻量桌面伴侣：复用用户已经安装的 `dsh` CLI 和现有 DSH Home，在自己的桌面 WebView 中运行 DSH Chat。它不会复制 DSH、下载第二份 CLI、迁移配置或接管其他进程。

## 首次启动

1. 启动 Deepseek Harness Desktop。首页会先检查用户目录、登录 shell 的 PATH 和常见的 Node 全局目录；GUI 启动时也会把这些路径传给 CLI 子进程。
2. 找到 dsh 后会自动启动并打开 DSH Chat；如果没有找到，才会进入配置页。配置完成后会打开 Chat 并关闭当前配置窗口。
3. 如果需要调整 `DSH Home`、工作目录或本机端口，可从桌面菜单、Chat 顶部的设置按钮或桥接插件重新打开配置页。端口 `0` 表示由操作系统分配 loopback 空闲端口。
4. 如果 DSH 启动失败，配置页会显示 DSH 返回的错误信息，并允许复制已脱敏的完整错误日志。
5. 配置页和 Chat 使用跟随系统深浅色主题的界面；macOS 使用原生 traffic lights，Windows/Linux 使用融合页面的悬浮窗口控制，不会跳转到系统默认浏览器。

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

## 数据与进程边界

桌面端只向子进程显式传入 `DSH_HOME` 和工作目录，不读取或重写凭据，不生成第二份 YAML；`settings.yaml` 入口只打开用户已经存在的文件。桌面端只拥有和清理自己启动的一个 DSH 进程树：Unix 使用独立进程组，Windows 使用系统 `taskkill /T`。端口被占用时直接失败，不接管或停止其他进程。
