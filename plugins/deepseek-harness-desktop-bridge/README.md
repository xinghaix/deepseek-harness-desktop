# Deepseek Harness Desktop 桥接插件

这个目录是 DSH 的可选 profile bundle。安装后，DSH WebView 的「设置 → 插件 → 桌面管理」会显示桌面端状态，并提供启动、停止、重启 DSH 和重新打开桌面配置页的按钮。

## 安装

在项目根目录执行：

```sh
dsh plugin --profile web add file:./plugins/deepseek-harness-desktop-bridge
```

然后重新从 Deepseek Harness Desktop 启动 DSH。桌面端只向自己启动的子进程注入回环控制地址和随机令牌；插件没有任意 shell 执行权限，令牌也不会显示在 DSH 页面或日志中。

如果 DSH 当前正在运行，profile 的 live patch 会在安装后重新加载；若没有立即出现菜单，使用桌面端的「重启 DSH」按钮。
