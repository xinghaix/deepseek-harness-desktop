# 为啥 dsh-context 点开会话很快，桌面桥接却慢

> 对照对象：社区插件 [dsh-context](https://github.com/bowenliang123/dsh-context)（clone 于 2026-09-17 `main`）vs 本仓库内置 `desktop-bridge` 托盘「打开指定会话」。
>
> 口径：本仓库工作树；DSH 实现以本机 `@deepseek-ai/dsh-client-ui-workspace` / `@deepseek-ai/dsh-api-session-controller` 为准。本文只记录对照结论，不改产品源码。

## 结论摘要

两边**最终调用的是同一条 DSH 选中动词**。dsh-context 快，不是因为它有一条更聪明的历史加载通道；是因为它在**已经热着的 Chat 页面里、同一个 JS 事件循环**里点下去，并且对「当前会话」几乎是 no-op。

本仓库慢的不是 Go 桥、也不是 `ExecJS` 本身（先前 profiling 已把桥接 dispatch 排除为瓶颈），而是：

1. **调用发生在页面外**：托盘 → 原生 `ExecJS` → `CustomEvent` → 还可能 `Show`/`Focus` 唤醒隐藏 WKWebView。
2. **保险路径比侧边栏多一截**：等 `sessions.list` 快照里有这个 id，再走官方 `uiWorkspace.openSession`（`sessions.open` + `layout.selectPanel(null)`），外加 claim 轮询兜底。
3. **冷会话的真正耗时在 DSH 下游**：第一次上台会 `events.open({ maxMessages: 50 })`，再在 JSC 里把最多约 50 条消息整页挂进 React DOM。这一点 **dsh-context 点一张从未打开过的卡片时同样要付**。

截图里被框出来的那张卡带「当前」徽章。这种点击在 dsh-context 里几乎等于「关掉 overlay」——会话已经在舞台上、历史窗口已经 `open`，所以会「非常快」。

## 1. dsh-context 实际怎么跳

仪表盘挂在 root 作用域 `shell.overlay`（不是 layout 全局面板），开/关靠模块内 `overviewStore`。卡片是一整块 `<button>`：

```ts
// src/client/components/overviewPanel.tsx
const openOne = (id: string): void => {
  openSession(ctx, id)
  overviewStore.set(false)   // 同一 tick 关掉 overlay
}
```

`openSession` 自己只有这一句，注释写明是「sidebar row click's mechanism」：

```ts
// src/client/overview.ts
export function openSession(ctx: ClientCtx, id: string): void {
  try {
    const sessions = ctx.get('sessions') as SessionsFace | undefined
    if (sessions !== undefined && typeof sessions.open === 'function') sessions.open(id)
  } catch { /* the jump is best-effort; the panel closes regardless */ }
}
```

要点：

| 项 | dsh-context |
| --- | --- |
| 调用点 | 页面内 click handler，同一 JS turn |
| 选中 API | `ctx.sessions.open(id)` → `manager.select(id)` |
| Overlay | 自己的 `overviewStore.set(false)`，**不等**历史 RPC 回来 |
| 是否关 Settings | 否。`shell.overlay` 不是 `layout.selectPanel` |
| 是否等 list 基线 | 否。卡片已经来自 `useSessions` 快照，id 一定在 list 里 |
| 失败策略 | swallow，面板照关，手势不卡死 |

官方侧边栏行其实走的是 `uiWorkspace.openSession`（见 `dsh-client-ui-workspace/lib/client.js` 的 `browserInjected.open`），比 dsh-context 还多一步 `layout.selectPanel(null)`。dsh-context 用更底层的 `sessions.open` 是对的：`selectPanel(null)` **关不掉** `shell.overlay`，他们必须自己关。

## 2. 本仓库实际怎么跳

托盘点击：

```
menu OnClick
  -> pendingOpen.set(id)
  -> chat.ExecJS(CustomEvent dsh-desktop-open-session + window.__DSH_DESKTOP_OPEN_SESSION_PENDING__)
  -> revealChatFromTray()  // Show + Focus；没有 Chat 窗则 OpenDSH
```

页面里 `desktopbridge/lib/client.js`：

1. 听 `dsh-desktop-open-session`，同时 POST `/v1/claim-open-session`（防 ExecJS 丢失）。
2. `flushPendingOpenSession` **必须** `snap.byId[id]` 才调用 `uiWorkspace.openSession(id)`。没有就挂着，等 `sessions.list.subscribe`。
3. 冷启动 / HMR：claim 轮询 500ms → 10s。
4. 1s 去重，避免 event + claim 把 `openSession` 打两遍（两遍会拉两次历史、两次 layout）。

官方导航：

```js
// @deepseek-ai/dsh-client-ui-workspace
openSession(sessionId) {
  this.sessions.open(sessionId);
  this.ctx.layout.selectPanel(null);
}
```

`sessions.open` 等于 `manager.select`：校验 id 在 list 里，否则抛 `sessions.select: unknown session`。本仓库因此**不能**在 list 未就绪时盲打，dsh-context 没有这个问题（卡片已经证明 id 在 list 里）。

测试明确禁止走捷径：`plugin_test.go` 看到 `ctx.sessions.open(id)` 就 fail——托盘必须能从 Settings 回到会话，不能绕过 `selectPanel(null)`。

## 3. 选中之后 DSH 自己做什么（两边一样）

`manager.select` 同步改 `selected` 并 `notifyNow`。`ClientSessions.followCurrent` 订了 list：

- `current === this.watched` → **直接 return**（再点当前会话是 no-op）。
- 否则把舞台搬到新 id，`record.session.open()`。

`Session.open()`：

- `openState === 'open'` 或已有 in-flight promise → 幂等返回。
- 否则 `doOpen` → `events.open({ maxMessages: 50 })`，再让 Chat 把这一页挂进 DOM。

文件头注释：Sessions remain resident after creation so their open Remote sources keep running off-screen. 所以：

- **当前会话**（截图那张「当前」卡）：dsh-context 几乎只关 overlay。
- **本页已经打开过的会话**：切回去不再拉 50 条。
- **从未上台的冷会话**：dsh-context 和托盘都要付历史 + React 渲染。dsh-context 仍然「感觉快」，因为 overlay 已经没了、Chat 窗已经在前台、侧边栏高亮已经同步上去。

## 4. 延迟拆开看

```
dsh-context 点一张「当前」卡
  click -> sessions.open(已是 current) -> followCurrent no-op
        -> overviewStore=false（overlay 立刻消失，底下就是已画好的 Chat）
  体感：瞬时

dsh-context 点一张冷卡
  click -> sessions.open -> select 同步（侧边栏立刻亮）
        -> overlay 立刻关
        -> followCurrent -> 第一次 events.open(50) + 渲染   <- 真正的等待
  体感：面板先没了，然后消息冒出来

本仓库托盘（窗已在前台、list 已就绪、目标已是 current）
  原生菜单 -> ExecJS -> CustomEvent -> uiWorkspace.openSession
        -> select 几乎 no-op + selectPanel(null)
        -> Show/Focus（可能抢焦点 / 合成器抖一下）
  体感：比 overlay 关慢一截，但仍不应是「卡住」

本仓库托盘（窗在托盘里藏着，或目标是冷会话）
  同上，再加上：
        WKWebView 从隐藏恢复（timer/合成器解节流、整页重绘）
        冷会话 50 条历史 + JSC 渲染
  体感：先看到旧画面/空窗，再切过去 —— 这就是「很慢」
```

先前托盘专项已经把桥接 dispatch 排掉（热路径先 `ExecJS` 再 `Show`/`Focus`，claim 去重）。剩下的是 DSH 历史窗口和 WKWebView 里的 SPA，不是 `desktop-bridge` RPC。

## 5. 为什么不能「抄 dsh-context 改成 sessions.open」

| 抄它的写法 | 托盘场景会怎样 |
| --- | --- |
| 只 `sessions.open`，不管 layout | 停在 Settings / 其它 `main` 面板里，会话在底下切了用户看不见 |
| 不等 `snap.byId` | 冷启动 / list 未就绪抛 `unknown session`，点击被吞（本仓库曾经踩过） |
| 关 overlay 当成功反馈 | 托盘没有 overlay 可关；用户在等的是窗口出现 + 对话画出来 |
| 页面内同步 click | 托盘必须跨进程；隐藏 WebView 上 `evaluateJavaScript` 也解不了合成器唤醒 |

已落地（托盘热路径）：目标已是 `list.current` 时只 `selectPanel(null)` + Escape；切会话只走 `uiWorkspace.openSession`（DSH `followCurrent` 自己 `session.open()` 拉历史）；idle 预热仅在 `trayEnabled` 且 `traySessionLimit` > 0 时运行（上限即该值，默认 5）；ExecJS 同回合调 `window.__DSH_DESKTOP_OPEN_SESSION__`；窗已可见跳过 `Show`；claim 离开 click 当拍。仍改不了从未上台且未预热完的冷会话第一次 `events.open(50)` + JSC 渲染。

可以学的只有「别做多余的工作」：

- 目标已经是 `list.current`：不重走 `openSession`，仍 `selectPanel(null)` 以便从 Settings 回来。
- 热路径上 event / 同回合 function 已经送到就不要再打 claim（claim 只留作丢失兜底轮询）。
- 窗已经 visible 时跳过 `Show()`，仍 `Focus()`。

这些都不会让冷会话的 50 条历史变快。那一段在 DSH Chat，本仓库改不动。

## 6. 一手来源

- dsh-context：`src/client/overview.ts` `openSession`；`src/client/components/overviewPanel.tsx` `openOne`；`src/client/index.ts` `shell.overlay`
- 本仓库：`internal/desktop/tray.go` `openChatSession` / `dispatchOpenSession`；`internal/desktop/open_session.go`；`internal/dsh/desktopbridge/lib/client.js` `flushPendingOpenSession`
- DSH：`dsh-client-ui-workspace` `UiWorkspaceService.openSession`；`dsh-api-session-controller` `ClientSessions.open` / `followCurrent` / `Session.open` / `PAGE_MESSAGES = 50`
- 本仓库已有结论：`docs/research/tauri-cef-vs-wails3.md` §1；Hindsight「Tray click opens Chat session」
