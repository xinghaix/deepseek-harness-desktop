# Deepseek Harness Desktop 桥接插件（已内置）

从当前版本起，桌面端在每次拉起自己拥有的 `dsh web` 时，会通过 Cordis `--patch`
注入内置桥接（与 `webview-boot` 同类）。**不必再**执行：

```sh
dsh plugin --profile web add file:./plugins/deepseek-harness-desktop-bridge
```

内置源码与嵌入覆盖位于 [`internal/dsh/desktopbridge/`](../../internal/dsh/desktopbridge/)。
本目录仅保留作历史兼容说明；请不要再手装到 web profile，以免与内置菜单重复。

若以前安装过 profile 副本，内置 `--patch` 会先 `remove` 同 id 再插入；也可手动：

```sh
dsh plugin --profile web remove @deepseek-ai/deepseek-harness-desktop-bridge
```

在 DSH Chat 打开「设置 → 桌面设置」（设置左侧一级导航，与「模型」「插件」同级）即可使用。控制面仅监听 `127.0.0.1`，
白名单 RPC + 随机令牌（常量时间比较），令牌不进页面/日志/状态 JSON。

注册槽位为 Cordis/DSH 的一级设置页 `settings.section`（与「模型」「插件」「插件市场」同级）。
`settings.plugins.tab` 仅能挂在「插件」分区内；要出现在设置左侧主导航，必须用 `settings.section`。
更深层的「应用专属顶栏入口」需上游 DSH 壳层改动，本仓库无法单独实现。
