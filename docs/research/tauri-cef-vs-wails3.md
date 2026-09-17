# Tauri v3 CEF vs 当前 Wails 3：JS 性能与内存

> 研究目标：社区反馈 macOS 系统 WebKit / WKWebView 在长 session 下切会话卡顿，明显高于 Chromium（Electron）方案。Tauri `3.0.0-alpha.1` 已提供 CEF。本文核对一手来源，评估：能否在尽量提高 DSH Chat JS 性能的同时，把运行内存和分发包保持相对较小；并与本仓库当前 Wails 3 对照。
>
> 口径：本仓库工作树（`go.mod` Wails `v3.0.0-beta.22`）；Tauri 以 GitHub tag `tauri-v3.0.0-alpha.1`（2026-09-15）为准。本文只记录研究结论，不修改产品源码。

## 结论摘要

1. **社区对 WKWebView 的抱怨成立，而且主要是 macOS（以及 Linux WebKitGTK）问题。** Windows 上本仓库已经走 **WebView2（Evergreen Chromium / V8）**，再换 CEF 几乎没有 JS 收益，反而会自带一份 Chromium。
2. **Tauri v3.0.0-alpha.1 确实支持 CEF，但是 opt-in 运行时，不是默认。** 默认仍是 wry 系统 WebView（macOS WKWebView、Windows WebView2、Linux WebKitGTK）。CEF 路径是独立 crate `tauri-runtime-cef`，绑定 **CEF 152.3.0 + Chromium 152.0.6**。
3. **CEF 不是「小内存 Chromium」。** 它去掉的是 Electron/Node 主进程和 Electron API，**不是** Chromium 本身。首次构建要下载约 **1 GB** 的 CEF 发行包；macOS arm64 的 Spotify CEF **client/minimal 压缩包约 125 MB**，standard 约 **288 MB**。本仓库当前 darwin-arm64 **DMG 约 11 MB、主二进制约 18 MB**。
4. **「V8 一样快、RAM 接近系统 WebView」这两个目标互相打架。** 长 session 的 JS 堆、React fiber、DOM 在任何引擎里都占大头；CEF 还要额外付 Browser + GPU + Renderer + Utility 多进程基线。CEF 的内存画像更接近「瘦身 Electron」，而不是「胖一点的 WKWebView」。
5. **不建议为本仓库迁移 Tauri 或 Electron。** 这与已有决策一致：Go + Wails 3 轻量壳、复用本机 `dsh` / `$DSH_HOME`。换框架等于重写 `internal/desktop`（窗口、菜单、托盘、快捷键、WailsFacade），`internal/dsh` 内核几乎得不到 CEF 的好处。Tauri CEF 目前仍是 **alpha**（crate 无 stable 版本）。
6. **若只想验证「卡顿是不是 JSC」：** 同一长 session 在 Chrome / 官方 Electron 桌面端 / 本应用之间对比。若 Chrome 也卡，瓶颈在 DSH SPA（历史消息渲染），换 CEF 收益有限；若只有 WKWebView 卡，才是引擎问题。

## 1. 社区问题拆开看

帖子里的判断可以拆成三层，不要绑在一起：

| 层 | 内容 | 对不对 |
| --- | --- | --- |
| 引擎 | macOS 系统 WebKit 的 JS（JavaScriptCore）弱于 Chromium V8，长 session / 大切 DOM 时卡 | 对。DSH Chat 是重 SPA（React、markdown、插件 combo、会话历史） |
| 框架 | 「凡是 Tauri 都慢」 | 不精确。Tauri 2 / 默认 Tauri 3 与本仓库 Wails 3 **用的是同一类系统 WebView**。慢的是 WKWebView，不是 Rust vs Go |
| 产品 | 所以应该改用 Electron fork | 性能上能改善 macOS JS；但体积、内存、进程模型、本仓库产品定位都更差 |

本仓库已经为 WKWebView 做过 **正确性** 补丁，不是性能补丁：长 `/plugins/??…` combo、Cookie 顶穿 Node 16KiB header（HTTP 431）。见 `AGENTS.md` WebView combo 节与 `internal/dsh/webviewboot*`。这些补丁避免白屏，**不会把 JSC 变成 V8**。

切 session 的剩余延迟，本仓库先前已经把桥接 dispatch 排除为瓶颈：热路径 `CustomEvent("dsh-desktop-open-session")` 与原生 Show/Focus 重叠后，剩下的是 **拉历史（最多约 50 条）并渲染**。见托盘导航实现与 Hindsight「Tray click opens Chat session」。

## 2. 当前 Wails 3（本仓库）

依据：`go.mod`、`AGENTS.md`、`docs/research/official-desktop-vs-local.md`、`assets/darwin/entitlements.plist`、本机 `dist/`。

| 项 | 现状 |
| --- | --- |
| 壳 | Go 1.27 + Wails **v3.0.0-beta.22**（Wails 上游已有 nightly `v3.0.0-beta.23`，本仓库未跟） |
| Chat | 独立 WebView，`LoadURL` 本机 `dsh web` loopback HTTP |
| macOS | **WKWebView / JavaScriptCore** |
| Windows | **WebView2 / Chromium V8**（与系统 Edge 共享，不随安装包携带） |
| Linux | **WebKitGTK 6** |
| 宿主职责 | 窗口 / 菜单 / 托盘 / 桥接；**不**捆绑 Node、Chromium、第二份 dsh |
| 本机产物 | `dist/deepseek-harness-desktop` **18 MB**；`deepseek-harness-desktop-darwin-arm64.dmg` **11 MB**（2026-09-17 工作树） |
| 签名 | macOS entitlements 已含 `com.apple.security.cs.allow-jit`（WKWebView JIT）；生产公证仍待 Developer ID |
| Wails 缺口 | 无跨平台可取消 NavigationStarting；无 per-window origin ACL；无已注册 `dsh-app://` request handler。**没有 CEF/Chromium 后端** |

Wails v3 到 beta.23 的公开 release notes 仍是系统 WebView + GTK application id 等，**没有** CEF 运行时。GitHub issue 搜索 `repo:wailsapp/wails CEF chromium in:title` 为 0 条。

已有产品决策（`docs/research/official-desktop-vs-local.md`、Hindsight Key decisions）：

- 明确 **不迁移 Electron / Tauri**
- 价值在复用用户 CLI 与单一 `$DSH_HOME`，不在「自带浏览器」
- 官方 Electron 桌面端值得借鉴的是 transport / Renderer 权限 / 签名，不是 Chromium 本身

## 3. Tauri v3.0.0-alpha.1 实际交付了什么

一手来源：

- [tauri v3.0.0-alpha.1](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.1)（2026-09-15，commit `f44d111`）
- [tauri-runtime-cef v3.0.0-alpha.1](https://github.com/tauri-apps/tauri/releases/tag/tauri-runtime-cef-v3.0.0-alpha.1)
- [crates.io tauri-runtime-cef](https://crates.io/crates/tauri-runtime-cef)（`max_stable_version: null`，仅 alpha.0 / alpha.1）
- [examples/cef/README.md @ tauri-v3.0.0-alpha.1](https://github.com/tauri-apps/tauri/blob/tauri-v3.0.0-alpha.1/examples/cef/README.md)
- [crates/tauri-runtime-cef/Cargo.toml](https://github.com/tauri-apps/tauri/blob/tauri-v3.0.0-alpha.1/crates/tauri-runtime-cef/Cargo.toml)
- 绑定：[tauri-apps/cef-rs](https://github.com/tauri-apps/cef-rs)，crate `cef = "=152.3.0"`，对应 Chromium **152.0.6**（changelog：`Bump CEF to 152.3.0+152.0.6`）

### 3.1 默认 vs CEF

| 运行时 | crate | 浏览器 | 何时用 |
| --- | --- | --- | --- |
| 默认 wry | `tauri-runtime-wry` 3.0.0-alpha.1 | 系统 WebView（与 Wails 同类） | 不改 Cargo 依赖时 |
| CEF | `tauri-runtime-cef` 3.0.0-alpha.1 | 自带 Chromium 152 | **显式**依赖该 crate，并 `tauri::Builder::runtime(tauri_runtime_cef::Cef)` |

官方 example 写明：

- `tauri-build` / CLI 靠 `links = "tauri_runtime_cef"` 与 `build.rs` 的 `cargo:runtime=cef` **检测** CEF 应用
- 然后：**打包 CEF 二进制发行包**、按 Chromium JIT 签 entitlements、macOS `tauri dev` **必须在 `.app` bundle 内跑**（CEF helper 按 bundle 路径拉起，不能当裸 executable）
- 同一可执行文件也是 renderer / GPU / network / utility 进程；`#[tauri_runtime_cef::cef_entry_point]` 在 helper 进程里提前返回
- 首次构建把 CEF 发行包下到 `{user cache}/tauri-cef` 或 `$CEF_PATH`，README 原文：**about 1 GB**
- bundler 目前只带 **`en-US` locale pak**；设别的 `Cef::locale` 会让 Chromium 自己的 UI 字符串加载失败

alpha.1 相对 alpha.0 的 CEF 修复：Linux `ContentMainRun failed with exit code 28`（补 `--no-first-run`）；macOS 嵌套 AppKit 事件循环 panic（菜单 / 模态）。这说明路径刚能跑通，仍在修桌面壳边角。

### 3.2 CEF 发行包体积（Chromium 152.0.6 / CEF 152.0.6）

来源：[cef-builds.spotifycdn.com/index.json](https://cef-builds.spotifycdn.com/index.json)，文件 `cef_binary_152.0.6+g708dc14+chromium-152.0.7977.83_*`。

| 平台 | client / minimal（压缩） | standard（压缩） |
| --- | ---: | ---: |
| macosarm64 | **125 MB** | 288 MB |
| macosx64 | 131 MB | 332 MB |
| windows64 | 161–164 MB | 343 MB |
| windowsarm64 | 156–159 MB | 320 MB |
| linux64 | 307 MB | 644 MB |
| linuxarm64 | 394 MB | 826 MB |

解压后的 Framework / `.app` 占用通常明显高于压缩包（Chromium 资源、locale、swiftshader 等）。**安装包下限大约是「再加 120–400 MB Chromium」，不是「再加几 MB」。**

对比本仓库现状：darwin-arm64 **11 MB DMG**。换成 CEF 后，仅浏览器运行时就会把安装包拉到 **十倍以上**。Electron 官方桌面端还要再加 Node + Electron 壳，通常更大。

## 4. 内存与进程模型（这才是「保持 RAM 较小」的约束）

| | Wails 3 系统 WebView（本仓库） | Tauri 3 + CEF | Electron（官方 / 社区 fork） |
| --- | --- | --- | --- |
| JS 引擎 macOS | JavaScriptCore | **V8**（Chromium 152） | **V8** |
| JS 引擎 Windows | **V8**（WebView2） | V8（自带 Chromium） | V8 |
| JS 引擎 Linux | JavaScriptCore（WebKitGTK） | V8 | V8 |
| 是否随包带浏览器 | 否（用 OS） | **是** | **是** |
| 多进程 | OS WebContent / GPU（可与 Safari/Edge 共享代码页） | Browser + GPU + Renderer + Utility（应用私有） | 同 CEF + **Node 主进程** + Electron 工具进程 |
| 空闲基线 RAM（量级） | 宿主 Go 数十 MB + 系统 WebView 视页面而定 | Chromium 多进程空载常见 **150–300 MB+**，再加页面堆 | 通常再高一截（Node + Electron） |
| 长 session RAM | 主要是 SPA 堆 + DOM | **同一份 SPA 堆 + DOM** + Chromium 基线 | 同左 + Node |
| 安装包 | **~11 MB** DMG | CEF client ≥ **125 MB** 压缩，解压更大 | 常见 150–250 MB+（视是否捆 Node/dsh） |

要点：

1. **切长 session 卡顿**主要是 CPU（JSC JIT / 主线程 React commit），不是「Wails 比 Tauri 慢」。
2. **长 session 内存**主要是消息文本、markdown AST、React fiber。换 V8 **不会** magically 变小；V8 堆有时比 JSC 更大。
3. CEF 相对 Electron 能省的是：**没有 Node 主进程、没有 Electron 的 chrome-app 层、可以用更瘦的 Rust/Go 宿主**。这大概是几十到一百多 MB 量级，**不是**从 500 MB 降回系统 WebView。
4. Windows 上 WebView2 已经是「共享的 Chromium」：性能接近 CEF，内存/磁盘远优于自带 CEF。**三端一刀切上 CEF 会把 Windows 的优势丢掉。**

因此：若目标写成「macOS 上接近 Electron 的切会话手感，同时全平台内存接近现在的 Wails」，**做不到**。可做成的是：

- 默认继续系统 WebView（Windows 已经够快）
- 仅 macOS/Linux 提供可选 Chromium 后端（工程成本高，见第 6 节）
- 或者接受安装包和 RAM 都按 Chromium 应用来算

## 5. 和当前 Wails 3 的框架对比（不只是浏览器）

| 维度 | 本仓库 Wails 3 | Tauri 3 + wry（系统 WV） | Tauri 3 + CEF | Electron fork |
| --- | --- | --- | --- | --- |
| 宿主语言 | **Go**（已有 `internal/dsh`、`internal/desktop`、更新器） | Rust | Rust | Node/TS |
| Chat 宿主 | 系统 WV | 系统 WV | Chromium 152 | Chromium（随 Electron 版本） |
| 复用本机 dsh | 已做 | 可做，但要重写壳 | 同左 | 官方走捆绑 runtime；社区 fork 各异 |
| macOS 长 session JS | 弱项 | 弱项 | **强项** | **强项** |
| 包体积 / 空闲 RAM | **最优** | 与 Wails 同类 | 接近瘦 Electron | 最重 |
| 成熟度 | Wails v3 仍是 beta，但本仓库已发版跑通三端壳 | Tauri 2 稳，v3 才 alpha | **alpha.1，下载 170 次量级** | 最成熟 |
| 本仓库迁移成本 | — | 重写 `internal/desktop` | 同上 + CEF 打包/公证/helper | 重写全部 Go 壳；与「非 Electron」专项相反 |
| 更新 / 签名 | 已有 Ed25519 manifest | 需重做 | CEF Framework + helper 公证更重 | electron-updater 成熟 |
| Linux | WebKitGTK，体验看发行版 | 同左 | 自带 Chromium，包极大 | 官方 Desktop **不以 Linux 为发布目标** |

对本仓库特别贵的部分：

- `internal/desktop` 大量依赖 Wails API：菜单 role、accelerator、托盘、`InvisibleTitleBarHeight`、`WailsFacade` 窗口名 gate、`ExecJS`、关窗钩子。
- `internal/dsh` **故意不依赖 Wails**，迁移框架几乎搬不走性能问题（问题在 WebView 里的 Chat）。
- CEF 在 macOS 上强制 `.app` + helper + JIT entitlements + 可能的 GPU sandbox。本仓库更新器按「单个二进制 / 目录替换」设计，要扩成「Framework + 多个 helper」事务。

## 6. 可选路线（按推荐顺序）

### A. 维持 Wails 3（推荐默认）

继续系统 WebView。把性能工作放在 **能测量的地方**：

1. **A/B：** 同一 `DSH_HOME`、同一长 session，分别在 Chrome、本应用、官方 Electron 里切会话，记主线程耗时。区分「JSC 慢」vs「SPA 渲染慢」。
2. 若 SPA 也慢：推动上游虚拟化消息列表、限制同时挂载的 markdown、会话切换时卸载旧树。桌面端 `--patch` 不该重写 Chat 渲染器。
3. 保持 webview-boot 热路径（整段 combo XHR+`eval`），不要退回拆包。
4. Windows 用户已经在用 Chromium；文档里如实写「macOS 为系统 WebKit，长会话可能不如 Electron 跟手」。

### B. 不要现在迁 Tauri CEF

阻止因素：alpha、1 GB 开发缓存、安装包数量级变化、Go 壳重写、更新器/公证、与已记录决策冲突。等 **Tauri 3 稳定且 CEF runtime 有生产案例** 再重新评估，且即便那时也应是 **macOS 可选后端**，不是默认。

### C. 不要为了跟手去迁 Electron

官方 `apps/desktop` 是另一产品（捆 Node/dsh/独立 profile）。社区 Electron fork 手感更好，是因为 V8，不是因为它们的桌面集成更强。迁 Electron 会放弃本仓库的体积、Linux 矩阵、以及「非 Electron Transport」专项。

### D. 远期：仅 macOS 的 Chromium 可选后端（仅当 A 证明是纯引擎问题）

前提全部满足再谈设计：

- 测量证明 Chrome/Electron 明显快、WKWebView 不可接受
- 愿意把 darwin 安装包做到 100 MB+ 量级
- 上游 Wails 仍无 CEF

可能形态（都未做，成本从高到低大致）：

1. 等 Wails 若出现 CEF/Chromium backend（目前没有）
2. Chat 窗用独立 CEF 子进程，壳仍 Wails（两套 WebView 生命周期，最脏）
3. 整壳迁 Tauri CEF（最干净也最贵）

在那之前做 2/3 属于产品转向，需要单独立项，而不是「顺便提高性能」。

## 7. 能否把 JSC 换成 V8

**不能。** 在继续用系统 `WKWebView` 的前提下，没有 API、preference、Wails 选项或 entitlements 能把页面 JS 从 JavaScriptCore 换成 V8。

依据：

- Apple [WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) 是 WebKit；页面脚本由 [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore) 执行。`WKWebViewConfiguration` 可改 UA、媒体、脚本消息，**没有 JS 引擎字段**。
- Wails v3.0.0-beta.22 darwin 路径写死系统 WebView：`WKWebViewConfiguration* config = [[WKWebViewConfiguration alloc] init];` 然后 `[[WKWebView alloc] initWithFrame:frame configuration:config]`（`pkg/application/webview_window_darwin.go` 约 137–196 行）。自检 example 把 darwin 标成 `WKWebView (WebKit)`，Windows 才是 `WebView2 (Chromium-based)`。
- [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2) 是 Windows（及后续 Android）的 Chromium 嵌入件，**没有官方 macOS WebView2**。
- [v8go](https://github.com/rogchap/v8go) 之类是在 Go 进程里跑 JS 字符串，没有 DOM / CSS / 布局 / GPU，**不能**承载 DSH Chat。
- Chrome 早期曾把 V8 接到 WebKit，随后整棵渲染树分叉成 Blink。系统 `WebKit.framework` 不会、也不能换成那条路径。

因此「换成 V8」在工程上等于 **换掉整个浏览器控件**，不是换引擎：

| 做法 | 得到 V8？ | 还是 WKWebView？ |
| --- | --- | --- |
| 改 Wails `WKWebViewConfiguration` | 否 | 是 |
| 本机嵌入 V8 / v8go | 只得到无 DOM 的 JS VM | 页面仍是 JSC |
| Windows WebView2（已在用） | **是** | 否（本来就不是 WK） |
| 换成 CEF / Electron / Chromium | **是** | 否，整窗替换 |

macOS / Linux 要 V8，就必须接受上一节的 Chromium 体积与多进程内存；Windows 已经是 V8，没有可换的。

## 8. 桌面壳能力：后台 / Tray / 通知 vs 本仓库已验证的 Wails 3

本仓库已经落地并有契约测试的，不只是「能弹一个托盘图标」，而是一整套生命周期。对照 Tauri **v3.0.0-alpha.1 核心 + 插件 3.0.0-alpha.0**（2026-09-13/15 发布）。

### 8.1 本仓库 Wails 3 已验证面

| 能力 | 本仓库现状 | 依据 |
| --- | --- | --- |
| 关最后一窗不退出 | `ApplicationShouldTerminateAfterLastWindowClosed: false` | `main.go` |
| 关窗藏后台 | `closeToTray` → `hideToTray`（Hide，不 Destroy） | `service.go` / `tray.go` |
| ⌘W / Ctrl+W | 始终 Hide；**不** `RequestQuit` | 菜单 + `CloseChatToTray` 测试 |
| 关窗钩子 | Common.WindowClosing **加** darwin `WindowShouldClose` / Windows `WindowClosing` / Linux `WindowDeleteEvent` | `service.go` 与 `service_test.go` |
| 托盘总开关 | `trayEnabled`；关掉则销毁托盘并强制关 `closeToTray` | `prefs.go` / `tray.go` |
| 托盘内容 | 彩色图标、运行中角标动画、tooltip、最近会话（过滤 blank/归档/subagent）、🟢/🔴 前缀、点击 `openSession` | `tray.go`、`tray_icon.go` |
| 单实例 | Wails `SingleInstance` + UniqueID，第二实例唤回窗口 | `main.go` |
| 原生菜单 | macOS AppMenu role；Win/Linux 文件菜单；Hide/HideOthers/ShowAll；快捷键热更新 | `menu.go` |
| 对话框 | `app.Dialog.OpenFile` / 选目录 / 退出确认 Question | `service.go` / `quit.go` |
| 窗口叠放 | 配置模态 AlwaysOnTop、dim Chat、`ExecJS` | `windows.go` / `service.go` |
| 系统通知 toast | **未使用**。WebView `PermissionNotifications` 为 **Deny** | `windows.go` `deniedWebviewPermissions` |

用户能感知的「有任务/出错」走的是 **托盘图标 + 菜单项**，不是 Notification Center。

### 8.2 Tauri 3 有没有对等 API

| 能力 | Tauri 3 状态 | 是否「完善」 |
| --- | --- | --- |
| Tray | 核心可选 feature `tray-icon`（`crates/tauri/src/tray`，依赖 [tray-icon](https://crates.io/crates/tray-icon) 0.25） | **API 有，平台语义不齐**。官方写明：**Linux 不发 click/enter/move 事件**（图标和右键菜单仍在）；Linux **菜单一旦 set 不能移除或整体替换**，只能改内容；Linux 有时必须先挂一个菜单图标才可见 |
| 关窗藏后台 | `Window` hide/show（window plugin 暴露 `is_visible` 等）；关窗可 `CloseRequested` + prevent close。需自己把「最后一窗」配成不退出 | 模式在 Tauri 2 就常用，**v3 + CEF 未在本产品三端验证** |
| 单实例 | [tauri-plugin-single-instance 3.0.0-alpha.0](https://crates.io/crates/tauri-plugin-single-instance) | 插件仍是 **alpha.0**，依赖 `tauri ^3.0.0-alpha.0`，核心已是 **alpha.1** |
| 系统通知 toast | [tauri-plugin-notification 3.0.0-alpha.0](https://crates.io/crates/tauri-plugin-notification)（桌面走 `notify-rust`） | 同样 **alpha.0**；且本仓库当前 **故意不用** Web 通知 |
| 全局快捷键 | `tauri-plugin-global-shortcut` 3.0.0-alpha.0 | alpha |
| 文件对话框 | `tauri-plugin-dialog` 3.0.0-alpha.0 | Wails 是核心 `app.Dialog`；Tauri 3 拆成插件且 alpha |
| 开机自启 | `tauri-plugin-autostart` 3.0.0-alpha.0 | 本仓库未做；插件也是 alpha |
| 原生菜单 | 核心 `muda`（`crates/tauri/src/menu`） | API 有。CEF alpha.1 **刚修** macOS 嵌套 AppKit 循环：上下文菜单 / 模态下 `run_on_main_thread` 会 panic（`tauri-runtime-cef` changelog） |
| Linux GTK | wry 默认 GTK3；**CEF 强制 GTK4**。`gtk3`+`gtk4` 不能同进程 | 选 CEF 等于 Linux 菜单/窗体走 GTK4，和社区大量 GTK3 Tauri 2 经验不共用 |

2026-09-13 一批官方插件（notification、dialog、updater、global-shortcut、autostart、clipboard、fs、shell、os、process）**全部停在 3.0.0-alpha.0**，稳定版仍是 2.x。核心 `tauri` 已发 3.0.0-alpha.1。这不是「插件生态已就绪」，是 **核心比插件快一个 alpha**。

### 8.3 和「已经跑通的 Wails 3」差在哪

1. **有 API ≠ 本仓库这套语义已验证。** 动态建毁托盘、⌘W 永不退出、X 才 closeToTray、三端关窗钩、会话菜单过滤、先 `ExecJS` 再 Show/Focus、macOS 不用 `SetBitmap`——这些都要在 Tauri/CEF 上重写并在 darwin/windows/linux 再测一遍。
2. **CEF 运行时比 wry 更嫩。** Tray/菜单不走 WebView，理论上可与 CEF 并存，但 CEF 用 winit + 自己的 AppKit/GTK4 主循环。alpha.1 才修「菜单/模态嵌套事件循环 panic」，说明壳层交互刚开始碰真实桌面路径。
3. **Linux 托盘是弱项两边都有。** 本仓库已注明依赖 StatusNotifier/AppIndicator。Tauri 默认 ksni、可选 libappindicator，但 **左键 click 事件官方标 Unsupported**。若产品依赖「点托盘图标唤起窗口」，Linux 上不能照搬 macOS/Windows。
4. **通知：Tauri 有插件，本仓库没用。** 迁 Tauri 不会自动得到更好的任务提醒；当前产品路径是托盘。若以后要 Notification Center，Wails 3 也可以接系统通知，不必为此换框架。

**结论：** Tauri v3 **纸面上**覆盖 tray、hide、单实例、通知、对话框；**不能**说已经达到本仓库 Wails 3 在三端验证过的完整度。尤其是 CEF 路径 + 插件 alpha.0，后台常驻属于「能写 demo」，不是「能替换现网行为」。

## 9. 建议的实验（不改框架）

在本机、同一长 session 上：

1. Activity Monitor 看本应用 vs Chrome vs 官方 Desktop 的进程树和 RAM。
2. Safari / WKWebView 时间线：切 session 时 Long Task 是否在 JSC。
3. Chrome 打开 `http://127.0.0.1:<dsh web>`（需处理 token cookie）对比同一操作。
4. 若只有 WKWebView 卡：记录是否伴随 combo 二次加载、HTTP 431 回退路径（`webviewboot` 拆批）。拆批会让「插件多」的会话更慢，应确认没有误入 431 回退。

## 10. 最终判断

- **想要小内存、小安装包、复用本机 dsh：继续 Wails 3。** 这是本仓库的产品形状。macOS 长 session 跟手度会弱于 Electron，这是系统 WebView 的代价，不是实现质量问题。
- **想要 Chromium 级 JS：** Tauri CEF 在引擎上对，在工程与成熟度上 **现在不对**；Electron 更成熟但更重，且与仓库边界相反。
- **「CEF = 又快又省」不成立。** CEF 是「比 Electron 瘦的 Chromium」，不是「比 WKWebView 只胖一点点的 V8」。本仓库 11 MB DMG vs CEF ≥125 MB 压缩运行时，差的是一个数量级。
- **Windows 已经是 Chromium。** 全平台切 CEF 会伤害 Windows/Linux 的体积，只为修 macOS。

## 11. 来源

- 本仓库：`go.mod`、`AGENTS.md`、`docs/research/official-desktop-vs-local.md`、`assets/darwin/entitlements.plist`、`dist/` 体积
- [Tauri tauri-v3.0.0-alpha.1](https://github.com/tauri-apps/tauri/releases/tag/tauri-v3.0.0-alpha.1)
- [tauri-runtime-cef v3.0.0-alpha.1](https://github.com/tauri-apps/tauri/releases/tag/tauri-runtime-cef-v3.0.0-alpha.1) / [crates.io](https://crates.io/crates/tauri-runtime-cef)
- [Tauri examples/cef README](https://github.com/tauri-apps/tauri/blob/tauri-v3.0.0-alpha.1/examples/cef/README.md)
- [tauri-runtime-cef Cargo.toml](https://github.com/tauri-apps/tauri/blob/tauri-v3.0.0-alpha.1/crates/tauri-runtime-cef/Cargo.toml)（`cef = "=152.3.0"`）
- [cef crate 152.3.0+152.0.6](https://crates.io/crates/cef) / [tauri-apps/cef-rs](https://github.com/tauri-apps/cef-rs)
- [download-cef 3.0.0](https://crates.io/crates/download-cef)（tauri-cli alpha.1 与 CEF runtime 对齐）
- [Spotify CEF builds index](https://cef-builds.spotifycdn.com/index.json)（152.0.6 各平台压缩体积）
- [Wails v3.0.0-beta.22 / beta.23 releases](https://github.com/wailsapp/wails/releases)
- Wails darwin：`webview_window_darwin.go` 以 `WKWebView` + `WKWebViewConfiguration` 嵌入窗口（无引擎选择）
- [Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) / [JavaScriptCore](https://developer.apple.com/documentation/javascriptcore)
- Tauri 3 tray：`crates/tauri/src/tray/mod.rs`（Linux click 事件 Unsupported；Linux 菜单不可整体替换）
- [tray-icon 0.25](https://crates.io/crates/tray-icon)、[tauri-plugin-notification 3.0.0-alpha.0](https://crates.io/crates/tauri-plugin-notification)、[tauri-plugin-single-instance 3.0.0-alpha.0](https://crates.io/crates/tauri-plugin-single-instance)
- 官方插件 3.0.0-alpha.0（dialog / global-shortcut / updater / autostart 等，2026-09-13）；核心 tauri 3.0.0-alpha.1（2026-09-15）
- [Microsoft WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2)（无官方 macOS 版）
- 官方桌面端对照：`docs/research/official-desktop-vs-local.md`
