# macOS 原生右键菜单缺项：v0.1.5 兼容性修复

## 为什么发布说明有、实际没有

v0.1.5 标签与修复前当前分支的 macOS 菜单实现相同。功能代码存在，但读取菜单上下文依赖私有 `_stringByEvaluatingJavaScriptFromString:`。在本机 macOS 27.0（26A428）的真实 WKWebView 上，该 selector 不存在。

实际原生探针确认：

- `willOpenMenu:withEvent:` 确实在 WKWebView 实例上调用；不是 hook 没装，也不是应该改挂到 WKView。
- 私有同步 JS selector 的 respondsToSelector 为 false。
- 原生 Open Link 等菜单项的 representedObject 为 nil，旧回退也取不到 href。
- 因此旧 `dshReadContext` 返回空字典，原生菜单没有追加搜索/默认浏览器打开项。不是设置开关问题。

发布说明描述了实现目标，却缺少这一原生兼容场景的验收；先前 Wails/DOM 外链路由测试不能证明原生 NSMenu 中真的出现了项目。

## 修复

[chrome.go](internal/desktop/chrome.go) 在实际 contextmenu 捕获阶段，用公开的 WKScriptMessageHandler `dshContextMenu` 发送当前文本和 href；不阻止 macOS 默认菜单。

[原生实现](internal/desktop/context_menu_darwin.h) 将消息缓存到对应 WKWebView，在现有菜单 hook 中同步读取缓存并追加项目，不再调用私有同步 JS。空上下文也写入，避免复用上次的链接；数据有长度上限，缓存 3 秒过期。最终系统打开仍由已有 Go URL 策略校验，未放开任意协议。

[Go 适配](internal/desktop/context_menu_darwin.go) 在实际 NSWindow 的视图树找到 WKWebView 并幂等注册公开消息 handler；[窗口初始化](internal/desktop/webkit_fps.go) 同时覆盖已创建的 native view 和 RuntimeReady 后备。非 macOS 对应接口为 no-op，不改变原有自定义菜单。

原生 Objective-C 提取到共享 header，是为了让回归探针运行**实际生产实现**，而不是复制一个“看起来一样”的菜单实现。

## 实测

运行 [原生菜单回归](scripts/test-context-menu-darwin.sh)：

| 场景 | 系统原有项 → 加入后 | 搜索 / 打开动作次数 |
| --- | --- | --- |
| 选中文本 | 13 → 14 | 1 / 0 |
| 无选区链接 | 6 → 7 | 0 / 1 |
| 选中的链接 | 6 → 8 | 1 / 1 |
| 空白 | 2 → 2 | 0 / 0 |

测试使用真实 WKWebView、真实右键事件和 DOM Range 选区、实际生产 JS 捕获代码、公开 WebKit 消息、NSMenu 跟踪与 AppKit sendAction。原有菜单项的对象身份、相对顺序、标题、target、action、submenu 保留。最终 Go 打开/搜索边界用记录器，验证精确 href/选区；不实际启动系统浏览器。

同一测试编译旧实现：文本/链接/两者三种场景均失败，空白通过，形成 red → green 证据。WebKit 会自动选中普通链接上的词，所以“无选区链接”测试使用不可选中的真实锚点，而不是伪造缓存。

另运行真实 Wails [导航探针](tools/navigation-probe/main.go)：ChatWindowOptions + TuneNativeWebView 在初次加载和实际刷新后均得到 nativeMenu=true，确认消息 handler 真正安装到了 Wails 的远程 Chat WebView，而非只在独立 WKWebView 上可用。

```bash
bash scripts/test-context-menu-darwin.sh
go run -tags wails,production ./tools/navigation-probe -bridge -readiness minimal
go test -race ./...
go test -race -tags wails ./...
make build
```

## 最终检查

四项原生菜单场景、四项 Node 回放、两套全量 Go race 测试、本机 macOS arm64 `make build` 均通过。Windows/Linux 两架构核心包及 Windows Wails 两架构测试交叉编译通过；这是编译证据，不是外平台 GUI 验收。验证时安装包为 0.1.5-dev，未发布新的正式版本。

## 边界

当前原生验收环境仅为本机 macOS 27.0；不是所有历史 macOS 版本的认证。独立探针实际观察了 Share、Look Up、Translate、Speech 等原有项；Services 是否出现由 AppKit 环境决定，不能把本次探针说成验证了 Services 的实际出现。保留原对象/子菜单的逻辑不会主动删除 Services。

没有自动修改 GitHub v0.1.5 发布说明、打 tag 或发布正式版本；修复需重新构建并完全退出旧桌面进程后安装。用户正在运行的应用和会话未被重启。
