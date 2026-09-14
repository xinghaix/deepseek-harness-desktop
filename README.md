# Deepseek Harness Desktop

[English](README.en.md) · 中文

把本机已安装的 [DSH](https://github.com/deepseek-ai/dsh) 放进桌面窗口里用：不另装 CLI、不搬配置、不改你的 DSH Home。

当前版本见 [Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases)。参与开发 / 架构说明见 [AGENTS.md](AGENTS.md)。

## 它适合谁

- 已经用 `npm` / 其它方式装好了 `dsh`，希望有独立桌面窗口、托盘和系统快捷键
- 想在 Chat 里顺手管理「由这个桌面端拉起」的 DSH（启动 / 停止 / 重启、桌面偏好）

## 安装

1. 打开 [Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases)，下载对应平台附件：
   - **macOS**：`deepseek-harness-desktop-darwin-arm64.dmg`（Apple Silicon）或 `deepseek-harness-desktop-darwin-amd64.dmg`（Intel）
   - **Linux**：`deepseek-harness-desktop-linux-amd64` 或 `…-arm64`
   - **Windows**：`deepseek-harness-desktop-windows-amd64.exe` 或 `…-arm64.exe`
2. macOS：打开 DMG，把应用拖到「应用程序」。若提示来自未识别开发者，可在 Finder 中右键 → 打开。
3. 发布包为自签名、未公证；Windows 可能被 SmartScreen 拦截，属预期。

也可用源码自行构建，见 [AGENTS.md](AGENTS.md)「开发命令 / 发版」。

## 使用前准备

- 本机已安装可用的 `dsh`（终端执行 `dsh --version` 能成功）
- 已有或可创建的 DSH Home（桌面端只把它传给子进程，不会复制一份）

## 第一次打开

1. 启动应用后，会在常见位置查找 `dsh`（用户目录、登录 shell 的 `PATH`、常见 Node 全局目录等）。
2. **找到了**：自动启动并打开 Chat。
3. **没找到**：进入配置页。选好 `dsh` 路径、DSH Home、Chat 工作目录后，再启动；成功后会打开 Chat。
4. 启动失败时，配置页会显示已脱敏的错误，可复制完整日志排查；修好后点「重试」。

界面跟随系统浅色 / 深色。Chat 始终在应用内的窗口中打开，不会跳到系统浏览器。

## 日常使用

### 打开配置

可用下列任一方式再开桌面配置（改路径、语言、托盘、更新等）：

- macOS：应用菜单；Windows / Linux：「文件」菜单
- 快捷键：默认 `⌘,` / `Ctrl+,`（可在设置里改或清除）
- DSH Chat → **设置 → 桌面设置**

### 托盘

在配置或「桌面设置」里可分别控制：

| 选项 | 作用 |
|------|------|
| 开启系统托盘 | 总开关；关闭后不显示托盘图标 |
| 任务显示数量 | 托盘菜单里「最近会话」条数（`0` 表示不显示列表） |
| 关闭窗口到托盘 | 点 Chat 窗口 **关闭按钮** 时隐藏到托盘，而不是退出 |

补充说明：

- `⌘W` / `Ctrl+W`（若未清除）会隐藏 Chat；只有开启了托盘时才会用到托盘图标，否则回到程序坞 / 任务栏。
- 托盘菜单可打开 Chat、桌面配置、最近会话，以及退出。
- 有任务在跑时，菜单栏图标右上角会显示**翠绿**角标；最近会话里运行中为 `🟢`，出错为 `🔴`。

Linux 托盘依赖桌面环境的 StatusNotifier / AppIndicator 支持。

### 快捷键

在配置页或「桌面设置 → 快捷键」中可以：

- **点击按键位**录制新组合
- **清除**某项（清除后该加速键不再生效，菜单里仍可点）
- **恢复默认** / 全部恢复

默认包括：打开桌面设置、关闭/隐藏 Chat、退出；macOS 另有系统「隐藏应用 / 隐藏其他」。与其它项冲突时会提示且不保存。

### 更新

可在配置页手动检查更新，或开启「每天自动检查」。发现新版本后**不会**自动安装，由你确认后再装。

### Chat 里的「桌面设置」

DSH Chat **设置**左侧有一级入口「桌面设置」（与模型、插件同级），可查看与桌面端的连接状态，并管理**本应用拉起的** DSH 进程与桌面偏好。桥接由桌面端自动注入，一般不必再手动装插件。

若升级后看不到新选项，请重启桌面应用，或在 Chat 中重新加载 / 重新打开 Chat。

## 隐私与边界（使用者视角）

- 只管理本应用启动的那一个 DSH；不会去结束其它终端里自己开的 `dsh`。
- 不会扫描工作区去读你的对话内容，也不会改写 DSH 凭据或另存一份配置。
- 桌面自己的偏好存在 DSH Home 下的桌面运行目录里；DSH 自己的数据仍由 DSH 管理。

## 需要帮助？

- 发行说明与下载：[Releases](https://github.com/xinghaix/deepseek-harness-desktop/releases)
- 问题反馈：仓库 Issues
- 架构、进程边界、构建与发版：[AGENTS.md](AGENTS.md)
