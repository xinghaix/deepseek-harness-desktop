# DSH Desktop

用一个轻量跨平台桌面窗口管理**用户已经安装的 `dsh` CLI**。它不重写 DSH，不安装第二份 CLI，也不复制 DSH Home 或凭据。

## 使用方式

1. 启动桌面端。
2. 在「dsh 可执行文件」中保留 `dsh`，或用「选择文件」选择现有的 `dsh` / `dsh.cmd`。
3. 确认「DSH Home」「工作目录」「本机端口」；默认值来自当前用户的 `DSH_HOME` 和用户主目录。
4. 点击「检测 CLI」，再点击「启动 DSH」。
5. 启动成功后点击「打开 DSH 界面」，官方 DSH Web UI 会在系统浏览器打开。

桌面端只向子进程显式传入 `DSH_HOME` 和工作目录，不读取或重写凭据，不生成第二份 YAML。`settings.yaml` 入口只打开用户已有文件。

## 构建与测试

需要 Go 1.27、Wails 3 和目标平台原生 WebView 构建依赖。Wails 的 `Taskfile.yml` 会自动加入 `wails` build tag：

```bash
go test -race ./...
wails3 build
```

指定目标架构时：

```bash
GOOS=windows GOARCH=amd64 wails3 build
GOOS=darwin GOARCH=arm64 wails3 build
GOOS=linux GOARCH=amd64 wails3 build
```

Linux 构建需要 GTK 4 / WebKitGTK 6；macOS 构建需要 Xcode；Windows 构建使用 WebView2。未在目标系统实际构建或运行的组合，不宣称已验收。

## 进程边界

桌面端只拥有并清理自己启动的 DSH 进程树。Unix 使用独立进程组；Windows 使用系统 `taskkill /T`。端口被占用时直接失败，不接管或停止其他进程。
