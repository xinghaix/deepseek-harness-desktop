# 桌面点击与跳转兼容性排查

## 范围与结论

本次覆盖桌面壳、内置 desktop-bridge，以及本机安装的 DSH 0.1.6-alpha.2 中能追溯到的点击入口。检查 macOS / Windows / Linux 共用路径及各端适配；不修改已安装的上游 DSH，不接管非本应用启动的进程。第三方插件可新增任意导航方式，不属于“所有插件永久兼容”的保证。

**代码审查、自动化行为测试、交叉编译、原生端到端验收是不同证据。** 下述测试未自动启动用户默认浏览器、文件管理器或覆盖用户设置；原生打开接口以测试替身验证参数与调用次数。

## 追补：真实 Wails 传输缺口（用户安装后复现）

用户安装包含前述修复的二进制后，↗ 仍无响应。通过 [原生 Wails 探针](tools/navigation-probe/main.go) 复现：嵌入配置页为 `wails://localhost`，导入运行时后 `Call.ByName` 存在且原生 Ping 成功；远程 Chat 为 HTTP origin，只有空 `window.wails` 和底层 invoke，`Call.ByName` 为 undefined，原生调用计数为零。此前 42 项 DOM 测试人为提供了 Wails Call mock，只验证路由，不证明真实传输可用。

修复改为 `window.open → desktop-bridge 客户端 → DSH 认证 RPC → server-side token → /v1/open-external-url → 原生 URL 校验/系统打开`。不往远程页面暴露 bearer token，不通过直接加载完整 Wails runtime 绕过错误 origin。新增失败提示，接口缺失或请求失败不再静默丢弃。

新增 [真实插件 RPC/HTTP 集成测试](internal/dsh/bridge_rpc_test.go)，验证实际插件 handler 经认证 HTTP 到 Go host，保留旧 host 兼容；最终系统打开副作用仍用记录器替代，不能据此声称已在用户正在运行的应用中实点验收。

原生 Wails 探针已执行两种模式并通过：无 bridge 客户端时，远程 Call 为 undefined、原生外链调用 0 次、失败提示 2 次；`-bridge` 模式加载生产客户端后，远程 Call 仍为 undefined，但外链点击和 window.open 各到达一次 Go handler，总计 2 次，失败提示 0 次。嵌入配置页的真实 Wails Ping 对照均成功。探针的 `/rpc` 接收层为 fixture，不代替上述生产插件认证集成测试；两组测试分别覆盖原生页面和认证后端边界。

```bash
go run -tags wails,production ./tools/navigation-probe
go run -tags wails,production ./tools/navigation-probe -bridge
```

## 入口盘点

| 点击入口 | 实际路径 | 排查结果 |
| --- | --- | --- |
| 对话中的 HTTP(S) 网页链接 | MarkdownAnchor → React preventDefault → sidebarRight.openTab | 桌面仅在冒泡阶段兜底；保留 DSH 侧栏，避免双开 |
| 右上角“系统浏览器中打开” | window.open(url) → 认证 desktop-bridge RPC → 原生 OpenExternalURL → Browser.OpenURL | 不再依赖远程 Chat 不具备的 Wails Call；合法外链转到系统 |
| Ctrl / Cmd / Shift / Alt 点击 | DSH 跳过普通侧栏处理 → 桌面兜底 | 统一打开系统浏览器，测试单次调用 |
| 中键点击 | auxclick(button=1) | 补上原来遗漏的路由；右键 button=2 不消费 |
| 终端 OSC8 超链接 | confirm → window.open() → opener=null → location.href | 新增延迟、单次使用的导航句柄；保留上游确认，地址仍经相同策略校验 |
| 右键搜索 / 打开链接 | macOS 原生 WK 菜单；Win/Linux 自定义 Wails 菜单 | 保留两端菜单模式与原有共享 URL 校验；补回环地址别名/重复 token 防护 |
| Markdown 文件和行号、文件树 | button → openFile → sidebarRight.openResource | 不走外链逻辑，不更换 DSH 文件预览；按钮不被壳截断有回归覆盖 |
| 附件、历史图片、图片放大 | readAttachment → blob/data 图片 → React lightbox | 没有改写 img.src 或轻点预览；上游源码检查，完整 DSH lightbox 未实机验收 |
| HTML / PDF 资源预览 | 文档面板、blob iframe / PDF renderer | 保留原实现；不是系统浏览器打开路径，未放开任意 blob/data 顶层导航 |
| 交付文件“打开 / 显示所在位置” | /api/present.open、/api/changes.open → DSH Host | 已检查不经过壳的链接拦截；依赖 Host 权限/安装应用，未替换为任意 shell |
| 工作区“在应用中打开” | /open-in-app/open → Host 平台 launcher | 检查原生分平台适配；实际安装了哪些编辑器由 Host 探测决定 |
| 设置中的 Home / Workspace / 配置文件“打开” | NormalizeLocationOptions → 路径存在性校验 → Browser.OpenFile | 修复默认工作区为空、文件夹路径被变量展开/按空格拆开；文件和目录统一按一个字面路径分发 |
| 选择 CLI / Home / Workspace 对话框 | Wails OpenFile picker | Windows“取消”归一为无选择而非错误，其他错误仍返回；窗口归属/前后遮挡需实机验证 |
| 普通会话、设置面板按钮 | DSH 原生 UI / 官方 workspace API | 壳不截断按钮，未改写 DSH 内部路由 |
| 托盘打开会话 | 原生事件快速通道 + bridge claim 补偿 | 新增每次点击 requestId，避免延迟重复 claim 把用户从 B 跳回旧 A；新一次点击同一 A 仍有效 |
| 主菜单“打开 Chat” / 点击配置遮罩 | 共用未保存配置保护 | 不再静默清空 dirty 状态和丢弃未保存编辑；保留聚焦配置窗的既有语义 |
| 更新发布页 / 配置页按钮 | 桌面 facade / authenticated bridge | 复用原生接口；未更改更新下载、固定公钥或验签策略 |
| OAuth / 插件界面 | 已发现 Host auth_url/device_code 通知与原生 React 按钮 | 未发现可据此承诺完整兼容的通用 popup/postMessage 流程；须按实际启用 provider 验证 |

## 修复与测试位置

- [chrome.go](internal/desktop/chrome.go)：点击冒泡、系统浏览器、中键、终端延迟打开。
- [link_routing_test.go](internal/desktop/link_routing_test.go)：直接运行实际注入脚本的事件回放。
- [navigation_dom.js](internal/desktop/testdata/navigation_dom.js)：真实 DOM 的 SVG / 文本目标、修饰键、右键、中键、按钮、终端等 42 项检查。
- [WebKit 测试入口](scripts/test-navigation-webkit.swift)：在本机 WKWebView 中执行相同 DOM fixture，无需启动或重启桌面应用。
- [service.go](internal/desktop/service.go)、[路径打开测试](internal/desktop/path_open_test.go)、[路径默认值测试](internal/dsh/location_test.go)：文件和目录参数、缺失路径、错误透传。
- [file_dialog.go](internal/desktop/file_dialog.go)：Windows cancellation sentinel 薄适配。
- [external_url.go](internal/desktop/external_url.go)：原生浏览器最终 URL 防护。
- [open_session.go](internal/desktop/open_session.go)、[bridge.go](internal/dsh/bridge.go)、[客户端回放测试](internal/dsh/desktopbridge/client_test.mjs)：请求序号和旧协议兼容。
- [config_navigation.go](internal/desktop/config_navigation.go)、[配置导航测试](internal/desktop/config_navigation_test.go)：未保存保护行为测试及入口接线契约；不是完整窗口 E2E。

## 明确未解决 / 未验收的边界

1. **会话 ZIP 导出、下载落盘**：上游导出采用 detached 同源 a.download + click，文档级点击监听接不到。上游触发点击即提示成功，不代表文件确实保存。检查 Wails beta.22 后未找到应用层跨端下载目标选择与完成通知实现；Windows WebView2 的默认行为可能可用，不能据此断言三端都失败，也不能声称已修好。必须在三端验证实际保存并能解压的 ZIP。
2. **侧栏 iframe 内的导航 / 弹窗**：属于另一个 document，尤其跨源 iframe，不能靠主文档 window.open 覆盖来接管。右上角 ↗ 已修复不代表网页内部 target=_blank 全部兼容。需要原生导航/新窗口策略或上游明确的浏览器协议。不要通过取消 sandbox / 同源安全限制来掩盖。
3. **mailto 与其他系统协议**：上游 Markdown 允许 mailto，但桌面仍只允许 HTTP(S) 外部导航，本次未放开邮箱、编辑器或任意 custom scheme。需要独立制定收件人/邮件头白名单和本机 handler 策略，而非直接把任意 URI 送 OS。
4. **延迟打开句柄不是完整 Window**：只支持已核实的终端导航需求（opener、location.href/assign/replace、close/focus）。不模拟 document.write、postMessage 或通用 OAuth 子窗口。
5. **系统授权/默认应用依赖**：文件关联、默认浏览器、Linux xdg-open、Windows 对话框和 macOS 菜单都依赖目标机环境。自动化注入 mock 的通过不等于实际系统启动成功。
6. **托盘预热偏好即时同步**：源码检查发现预热参数主要在插件 apply 时获取，开关即时同步仍有改进空间；它不阻断会话导航，本次未扩展性能改造。
7. **保守 URL 策略**：带认证 token 的回环地址、别名与歧义解析被拒绝；非 ASCII 主机名且带非空 token 的 URL 也保守拒绝，普通不带 token 的 IDN 链接不受此项影响。

## 验证记录

- Node 注入脚本回放：中键与终端两项均先红后绿。
- 原生 macOS WKWebView / JavaScriptCore：42/42 DOM 检查通过。
- Chromium 152：同一份 fixture 42/42 通过。
- Go 两套全量 race 测试、四项 Node bridge/overlay/webview-boot 回放全部通过；本机 macOS arm64 `make build` 成功，开发版本 0.1.5-dev（ad-hoc 签名，未 notarize）。有既有 macOS SDK deployment-target 链接警告及 hdiutil 弃用警告，退出码均为 0。
- 实际 Wails BrowserManager 的 macOS 打开适配已通过“替换 OS executable、抓取单个 argv”测试；并未启动 Finder，也未验证用户文件关联。
- 跨编译通过：`internal/dsh` 与 `internal/desktop` 两个核心包的非 Wails 测试覆盖 darwin/windows/linux × amd64/arm64，共 12 个编译组合；`internal/desktop` 的 Windows Wails 测试 amd64/arm64 也编译通过。**只编译，不在本机执行外平台二进制**。首轮发现 bridge 测试误依赖 !windows fixture，已改为跨端测试辅助代码，未通过排除 Windows 测试规避。Linux Wails/GTK 原生构建未执行。
- Linux 容器执行环境：Docker CLI 存在，但 Colima socket 不存在，未启动或改动用户虚拟机；没有 Linux GUI 原生实测。
- Windows：无本机可用的 Windows GUI runner；没有 WebView2 原生实测。

可重复的本机命令：

```bash
go test -race ./...
go test -race -tags wails ./...
node internal/dsh/desktopbridge/client_test.mjs
node internal/dsh/desktopbridge/copy_session_menu_test.mjs
node internal/dsh/desktopbridge/hover_message_actions_test.mjs
node internal/dsh/webviewboot/hook_test.mjs
swift scripts/test-navigation-webkit.swift
make build
```

## 三端人工验收清单

每端都使用包含本次修复的新安装包，而不是旧运行中的进程：

- 对话网页链接开侧栏；↗、修饰键、中键各只打开一次系统浏览器。
- 文件相对路径、绝对路径和行号能预览；文件树、交付卡“打开/显示”各正常。
- 历史图片与附件放大、HTML/PDF 预览不受影响。
- 终端 OSC8 点击确认后打开；取消确认不打开。
- Home、默认/自定义 Workspace、配置文件路径含空格/中文/$ 时打开精确位置。
- 选择路径后取消无错误；确认 Windows 文件对话框不被置顶配置窗遮挡。
- 托盘打开 A 后普通切到 B，等待超过 10 秒不被旧 claim 拉回；再次点 A 可正常打开。
- 配置未保存时点击“打开 Chat”不丢编辑；保存/明确丢弃后仍能正常返回。
- 右键搜索/打开保留 macOS 原生菜单与 Win/Linux 自定义菜单；本地 token 地址不外抛。
- ZIP 导出实际落盘、可解压；单测或“导出成功”提示不能替代此项。
- 内嵌网页自己的新窗口、需要 OAuth 的实际 provider 另行验证。
