# Wails 3 x macOS: remaining performance headroom (no feature changes)

> Goal: without changing product features, swapping frameworks, or introducing CEF/Electron, judge whether this macOS client still has meaningful shell performance left — against official docs, Wails v3 source, and community issues.
>
> Baseline: Wails v3.0.0-beta.22 (go.mod). Chat is a separate WKWebView LoadURL of loopback dsh web. This note does not change product code.
>
> Related: [tauri-cef-vs-wails3.md](tauri-cef-vs-wails3.md) (JSC vs V8 / why not CEF).

## 结论摘要

1. **壳层已经没有数量级空间。** 用户可感知的卡顿几乎都在 Chat SPA（JavaScriptCore + 历史 DOM），不在 Wails 绑定。刚落地的 notify-pull、GOGC、`-s -w` 针对配置页 IPC 和体积，对 Chat 滚动/切会话几乎无感。
2. **macOS 上 Wails 暴露的 WebView 旋钮很少，真正影响帧率的开关没有公开 API。** 社区把 ProMotion 120 Hz 锁 60 FPS 追到 WebKit 的 PreferPageRenderingUpdatesNear60FPSEnabled（默认 true）。维护者明确：WKPreferences / WKWebViewConfiguration / Info.plist / defaults write 都碰不到它。
3. **不要为了「极致」去用私有 API 或 fork Wails。** 解锁 120 FPS 对 Chat 文本应用收益可疑、耗电确定；suppressesIncrementalRendering 被 Wails 写死为 true，改它必须 fork。
4. **还能做、且不改功能的，只剩测量与上游跟进：** Instruments / Safari Web Inspector 确认瓶颈在 JSC 还是壳；评估跟 Wails nightly；维持 combo 热路径。不要再往壳里塞 Raw Message / Protobuf。

## 1. 这个应用在 macOS 上实际跑什么

| 层 | 实现 | 热不热 |
| --- | --- | --- |
| 壳 | Go + Wails v3，InvisibleTitleBarHeight 原生拖条 | 冷。窗口/菜单/托盘 |
| 配置页 | 嵌入 assets/web，Wails bindings | 曾热（100/900ms 全量 Status），现已 notify-pull |
| Chat | 独立 WKWebView，LoadURL 本机 HTTP | **热。** React/markdown/插件 combo/最多约 50 条历史 |
| 插件加载 | webviewboot：整段 combo 一次 XHR + eval，431 才拆批 | 启动热路径，已按正确方向优化 |
| IPC | Chat 不走 Wails 绑定；桌面控制走认证 loopback bridge | 非每秒数千条 |

「还能不能极致优化」必须拆开：**壳** vs **WKWebView 里的 DSH**。后者换引擎才有数量级（见 CEF 笔记）；前者只剩边角。

## 2. 社区与官方：macOS WKWebView 还剩哪些旋钮

### 2.1 ProMotion 锁 60 FPS（真实，但对本应用几乎无用）

- Issue: [wailsapp/wails#6056](https://github.com/wailsapp/wails/issues/6056)（2026-08-30，open，v3 / macOS）。
- 现象：MacBook Pro 120 Hz 上 requestAnimationFrame 约 60；同一 WebKit 在 Safari 关掉 Prefer Page Rendering Updates near 60fps 后可达约 120。把该 preference 打到 Wails 创建的 WKWebView 上立刻从 60 到 120。
- 维护者 [leaanthony 的核对](https://github.com/wailsapp/wails/issues/6056#issuecomment-5474139757)：WebKit trunk UnifiedWebPreferences.yaml 里 PreferPageRenderingUpdatesNear60FPSEnabled 在 macOS **默认 true**，无 SDK/OS 门闸；visionOS 才是 false。实现是 AnimationFrameRate.cpp 把 120 折成 60。
- **没有公开 API。** WKPreferences 公开属性都不涉及帧率；无 identifier 的 WKPreferences 也读不到 NSUserDefaults。CADisableMinimumFrameDurationOnPhone 是 iOS。
- 后续补丁走私有 _WKFeature / WKPreferences._features。beta.22 的 MacWebviewPreferences **没有**对应字段。
- **对本仓库：** Chat 不是 rAF 游戏循环。60 FPS 足够滚动和输入。打开 120 Hz 会抬 GPU/能耗。**不建议做。**

### 2.2 suppressesIncrementalRendering = true（Wails 写死）

Wails v3 darwin 创建配置时写死 `config.suppressesIncrementalRendering = true;`（模块缓存 webview_window_darwin.go，v3.0.0-beta.22 约 L175）。iOS 同样 YES。

[Apple 文档](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/suppressesincrementalrendering)：为 true 时 WebKit **等文档就绪再画第一帧**，避免半成品闪烁。维护者在 #6056 里说它与 60 FPS cap **无关**。

关掉它可能让 Chat 首屏更早出现，也可能闪白。本仓库没有该选项的公开绑定。要改只能 fork Wails。**不值得为壳去 fork。**

### 2.3 Retina contentsScale / rasterizationScale

社区旧问题：WKWebView 在 Retina 上报 devicePixelRatio=1。Wails 只在 **Liquid Glass** 路径里设置 shouldRasterize + rasterizationScale = backingScaleFactor（webview_window_darwin.m configureWebViewForLiquidGlass）。默认 Chat 窗不走这条路径，本仓库也未开 Liquid Glass。shouldRasterize=YES 对滚动大 DOM 往往更差。Chat 用 MacTitleBarHiddenInsetUnified + InvisibleTitleBarHeight，不要为了「优化」打开 Liquid Glass。

若实测 Chat 里 window.devicePixelRatio 不是 2，再考虑只设 contentsScale、不要 shouldRasterize。这是测量项。

### 2.4 JS 执行路径已经是现代 API

Wails macOS ExecJS 用 -[WKWebView evaluateJavaScript:completionHandler:]（completionHandler:nil），不是已废弃的 stringByEvaluatingJavaScriptFromString。v2「高频 eval 撑爆 CString」主要是 Linux GTK。本仓库已禁止把 Status/logs 经事件/eval 推下去。**不要再引入 Raw Messages。** Chat 流量不在 Wails IPC 上。

文档：[evaluateJavaScript:completionHandler:](https://developer.apple.com/documentation/webkit/wkwebview/1415017-evaluatejavascript)

### 2.5 每窗一份 WKWebViewConfiguration

darwin 路径每次 [[WKWebViewConfiguration alloc] init]，没有共享 WKProcessPool / WKWebsiteDataStore。配置窗 + Chat = 两套 WebContent 进程是 WebKit 默认。共享能省一点基线内存，但 Wails 不暴露，且共享数据存储可能让 wails:// 配置页和 127.0.0.1 Chat 的 cookie 串味，和「Chat 必须独立 WebView 才能保住 SameSite=Strict cookie」冲突。**不要共享。**

### 2.6 本仓库已经打开、且应保持的 macOS 项

- ApplicationShouldTerminateAfterLastWindowClosed = false
- Chat：MacTitleBarHiddenInsetUnified + compact toolbar + InvisibleTitleBarHeight
- JavaScriptCanOpenWindowsAutomatically = false、关 DevTools / Inspector / 文件拖放
- 生产 -s -w、GOGC=60、512MiB Go 堆软上限（WebView RSS 不在 Go 堆）
- combo：一次 XHR + eval，431 才拆批

这些都不是还能再拧的螺丝。

## 3. 看起来像优化、其实会改体验或无效

| 想法 | 为何不做 |
| --- | --- |
| Raw Message / Protobuf | Chat 不走绑定；配置页已事件化 |
| 解锁 ProMotion 120 Hz（私有 API） | 无公开 API；耗电；Chat 不是 rAF 负载 |
| 关掉 suppressesIncrementalRendering | 需 fork Wails；可能闪白 |
| Liquid Glass + shouldRasterize | 大 DOM 滚动更差；改窗口外观 |
| 共享 WKProcessPool / DataStore | 可能破坏 Chat cookie 隔离 |
| 去掉标题栏 backdrop-filter | 视觉变化；开销限于窄顶栏 |
| 预热隐藏 WKWebView | 多一份 WebContent 常驻内存 |
| 升 CEF / Electron | 已否决；体积/内存/重写 internal/desktop |
| 配置页再压缩轮询 | 已隐藏暂停 + 过渡 250ms + 空闲 4s |

## 4. 若还要抠，正确顺序（仍不改功能）

1. **先测量 Chat，而不是再改壳。** 开发构建把 Inspector 接到 WKWebView。看切会话时 Scripting vs Rendering vs Painting。若 Chrome 里同一 dsh web 也卡，瓶颈在 DSH 前端，本仓库改不动。
2. **对照官方桌面端 / Chrome。** 方法见 CEF 笔记第 6 条。
3. **维持 combo 热路径。** 不要回到永远拆批顺序加载。
4. **Wails 升级只跟修复，不跟帧率私有 API。** nightly v3.0.0-beta.23 存在，但 #6056 在 2026-09 仍 open。为 120 Hz 升版本没有产品理由。
5. **Instruments：Energy。** 托盘隐藏后 WebContent 是否仍在跑定时器；若有，那是 DSH SPA 的定时器，不是 Wails。

## 5. 来源

- Wails v3.0.0-beta.22 源码（本机模块缓存）：webview_window_darwin.go / .m，MacWebviewPreferences
- [wails#6056](https://github.com/wailsapp/wails/issues/6056) 及 [维护者评论](https://github.com/wailsapp/wails/issues/6056#issuecomment-5474139757)
- [Apple WKWebView](https://developer.apple.com/documentation/webkit/wkwebview)
- [Apple suppressesIncrementalRendering](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration/suppressesincrementalrendering)
- [Apple evaluateJavaScript](https://developer.apple.com/documentation/webkit/wkwebview/1415017-evaluatejavascript)
- 本仓库 AGENTS.md WebView combo 节、internal/dsh/webviewboot*、internal/desktop/windows.go
