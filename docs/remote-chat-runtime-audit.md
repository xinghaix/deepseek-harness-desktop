# 远程 Chat 的 Wails 运行时同类问题复查

## 范围

在用户确认外链按钮可以跳转后，继续追查同一个根因：配置页加载 Wails 完整 JS runtime，而远程 DSH HTTP Chat 只有 Core，不具备 Call/Window API，也不会自动安装完整 runtime 的菜单、拖拽和 lifecycle 监听。

检查覆盖仓库内所有 `window.wails` / `_wails` 使用点、原生 `ExecJS` / `WindowRuntimeReady` 调用点和三端菜单/窗口实现。没有升级/修改上游 Wails、没有向 Chat 加载完整绑定 API、没有替换用户运行中的应用或配置。

## 找到并处理的同类缺口

| 入口 | 修复前的问题 | 本次处理 |
| --- | --- | --- |
| Win/Linux 自绘最小化、最大化、关闭、设置 | 等待不存在的 Wails Window/Call，100ms 无限重试 | 远程 Chat 走认证 chatWindowAction；配置页继续使用真实 Wails runtime；缺失通道显示错误，不再无限轮询 |
| 配置窗口外遮罩点击 | 远程页调用 Call.ByName(TryDismissConfig)，请求丢失 | 走 dismiss-config 固定动作，原生复用未保存保护，不绕过显式确认 |
| 托盘快速会话直达 | 原生 ExecJS 等待 runtimeLoaded，页面没有发送 native-ready | 仅 Chat 注入最小就绪脚本，允许已排队 ExecJS 发到页面；保留既有 claim 兜底与请求序号 |
| 显示/取消配置遮罩 | Go ExecJS 同样排队 | 同一最小就绪修复使这些原生脚本可执行 |
| WindowRuntimeReady 钩子 | Core 的 DOM config-ready 不等于原生 runtime-ready | 正确发送原生 lifecycle 消息；不伪造 Call API |
| macOS 高刷新率后备钩子 | 仅在 NativeWindow 尚未创建、依赖 ready 后备时受影响 | ready 修复恢复后备路径；原来的立即 tuning 路径并非全部失效 |
| Win/Linux 选中文本/链接右键菜单 | 只写 CSS，而读取 CSS 并展示菜单的 full-runtime 监听不存在 | 捕获阶段保留上下文，冒泡阶段尊重 DSH 已处理事件，使用认证 showChatContextMenu 调固定原生菜单 |
| Win/Linux 标题栏拖动 | --wails-draggable CSS 没有对应监听 | 只允许明确标题拖条上的可信左键手势，经原生即时消息执行，不经过异步 HTTP |
| Win/Linux 无边框窗口边缘缩放 | 同样缺 full-runtime 的边缘检测 | 5px 视口边缘、8 个固定方向，排除控件/输入/链接，不添加遮挡内容的 overlay |
| Windows 原生消息 receiver | Core 存储裸 postMessage，直接调用可能 this 错误 | ready、drag/resize 保留 chrome.webview 接收者；已有 Linux/mac 包装保留 |

## 有意保留的正常路径

- 配置页的 [app.js](assets/web/app.js) 仍使用 Wails Call/Events；[HTML](assets/web/index.html) 确实导入官方 runtime，真实原生 Ping 对照成功，不改成多余的桥接。
- macOS 系统交通灯、原生拖条和 WKWebView 扩展右键菜单不依赖远程 Call/Window；保留原生体验。
- Chat 桌面设置、文件路径打开、更新入口等已有认证 RPC 继续使用；未扩大为任意 Go 方法调用。
- 图片、附件、文件预览、普通会话和设置面板属于 DSH 内部 UI，不改写它们的路由。
- 用户已确认可用的外链按钮继续走认证桥接；本轮保留其回归测试。

## 边界与安全约束

- 新窗口动作仅允许 minimize / maximize / close / settings / dismiss-config，HTTP 与原生适配双重校验。只操作现有名为 dsh 的 Chat，不接受任意窗口名；close 仍调用 native Close，让已有 close-to-tray / 任务退出确认钩子决定行为。
- 右键请求仅收 x/y/text/href，整数坐标 0–100000，字符串有大小限制；Go 清洗链接/文本并派生固定菜单 ID，不接收任意菜单 ID。macOS 不走该自定义菜单 RPC。
- 拖动/缩放只能由可信、未被页面取消的鼠标手势触发；不延迟重放手势，不恢复双击缩放。WebView2 绑定接收者有回归覆盖。
- 就绪脚本仅匹配原生传入的精确 loopback origin、顶层 Chat 文档；排除管理页/已有完整 runtime；去掉 URL 中的登录 token，规范化默认端口；每个 document 只发送一次。
- Win/Linux 必须先装真实 setResizable，再发 ready；保留已有 callback。重试有上限，不引入永久计时器。原生 disabled file-drop callback 做兼容兜底，不启用文件拖放。
- 最小脚本没有实现 Wails Call/Window/Events 全 API，不能把 lifecycle 就绪当作授权或 origin ACL。认证令牌仍仅由宿主处理。

## 核心代码与测试

- [chrome_actions.go](internal/desktop/chrome_actions.go)：区分配置页与远程 Chat 的动作分发。
- [windows.go](internal/desktop/windows.go)：只给 Chat 安装 actions/chrome → gestures → readiness，遮罩点击转接固定动作。
- [chat_runtime.go](internal/desktop/chat_runtime.go)、[对应测试](internal/desktop/chat_runtime_test.go)：精确源、就绪、重试与回调兼容。
- [chat_drag.go](internal/desktop/chat_drag.go)、[对应测试](internal/desktop/chat_drag_test.go)：可信拖动/缩放、接收者、迟到 Core、重复注入。
- [客户端](internal/dsh/desktopbridge/lib/client.js)、[客户端回放](internal/dsh/desktopbridge/client_test.mjs)：安装固定动作函数，插件卸载时按函数身份清理，认证 RPC。
- [原生窗口动作](internal/desktop/window_actions_wails.go)、[原生菜单](internal/desktop/window_actions_context_wails.go)、[bridge](internal/dsh/bridge.go)：只暴露窄能力。
- [窗口 RPC 集成测试](internal/dsh/bridge_window_actions_rpc_test.go)、[菜单 RPC 集成测试](internal/dsh/bridge_context_menu_rpc_test.go)：实际 Node 插件 HTTP handler → 真实认证 Go bridge，最终原生操作使用记录器。
- [原生探针](tools/navigation-probe/main.go)、[探针说明](tools/navigation-probe/README.md)：真实 Wails 原生窗口，不伪造 window.wails。

## 已获取的验证证据

1. **真实 macOS Wails 初载/刷新差分**：无最小 bootstrap 时 hostReady=0、排队 ExecJS=0；加入生产 bootstrap 后每 document 一次 ready、每 document 排队脚本执行一次；重复注入不重复发送；外链依然到达原生记录器。
2. **原生 callback**：由 Go ExecJS 调用 dispatchWailsEvent、setResizable、四个 disabled file-drop callback，没有 JS 异常。
3. **五个生产动作完整前端路径**：真实 ChatWindowOptions 中的请求函数 → 未替换的生产 client → fixture HTTP → Go 记录器；每个动作每个 document 恰好一次。注意：不在此探针中实际关闭/最小化/创建配置窗口，避免混淆“传输通过”与“系统 UI 验收”。
4. **DOM 事件**：WebKit 与 Chromium 同一 fixture 50 项通过；窗口/菜单逻辑不伪造 Wails Call，模拟的是明确的认证 bridge 接口。操作系统菜单是否真的显示仍要目标机验证。
5. **平台协议回放**：WebView2 receiver-sensitive 错误、未安装 Core、重复注入、控件排除、禁用缩放等均先红后绿。模拟可信标志不能证明 GTK 收到了实际硬件按键，不能当作原生拖动验收。
6. **集成验证全部通过**：四项 Node 回放、两套全量 Go race 测试（普通 / wails）、diff/格式检查；两个核心包的 darwin/windows/linux × amd64/arm64 共享测试交叉编译通过，Windows Wails 桌面测试 amd64/arm64 编译通过。Linux Wails/GTK 本机 GUI 构建未执行。
7. **本机打包成功**：macOS arm64 0.1.5-dev，ad-hoc 签名、未 notarize；保留既有 macOS SDK deployment-target 链接警告和 hdiutil 弃用警告，命令退出码为 0。

可重复命令：

```bash
go test -race ./...
go test -race -tags wails ./...
node internal/dsh/desktopbridge/client_test.mjs
swift scripts/test-navigation-webkit.swift
go run -tags wails,production ./tools/navigation-probe -bridge -readiness baseline
go run -tags wails,production ./tools/navigation-probe -bridge -readiness minimal
make build
```

## 仍需目标机验收

Windows WebView2 与 Linux GTK/WebKit 的实际窗控、菜单位置/回调、可信鼠标拖动、八方向缩放、DPI/最大化/全屏/滚动条，需要在目标系统验证。当前机器只执行 macOS 原生探针；外平台交叉编译不代表原生 UI 验收。

上一轮列出的 ZIP 下载落盘、跨源 iframe 内弹窗、mailto/custom scheme、具体 OAuth provider 与本轮 runtime 初始化不是同一条路径；本次没有把这些标成已解决。详情见 [完整导航排查](docs/desktop-navigation-audit.md)。
