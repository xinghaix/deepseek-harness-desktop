# Hindsight 记忆设置

独立的 DSH Cordis 插件，在 **设置 → Hindsight 记忆** 和插件详情页提供同一套管理界面。不依赖桌面壳，不修改 DSH 内核，不安装或启动 Hindsight。

## 使用

1. 在 DSH 插件管理器中安装本目录。
2. 打开「设置 → Hindsight 记忆」。
3. 修改「在 DSH 中使用记忆」，或选择工作区修改仓库策略。
4. 点击「保存更改」。仓库策略需要勾选跨工具影响确认。
5. 等待任务空闲后重启 **DSH 服务**。刷新页面不等于重启；旧会话中的记忆不会被移除，需要干净上下文时另建会话。

安装和打开页面不会更改现有 Hindsight 配置。界面使用 DSH 主题与语言服务，支持中文、英文；其它 UI 语言回退英文。包的展示元数据提供八种语言。

## 配置语义

- 配置文件：`HINDSIGHT_CONFIG`，未设置则使用 `~/.hindsight/coding-agent.json`。
- DSH 总开关：`harnesses.dsh.disabled`，不修改其它 harness。
- 仓库策略：`banks.<resolvedBankId>.disabled`。影响共用同一配置和 bank 的其它接入工具；多个仓库可能映射到相同 bank。
- 跟随上层：只移除该 bank 的 `disabled` 字段，保留其它内容。
- 目录覆盖、环境变量、DSH 专属配置、静态 bank、动态模板、路径映射、linked worktree、bank 重定向和 opt-in 都参与保存配置的解释。
- 若 `harnesses.dsh.banks` 覆盖选中 bank，仓库编辑只读，防止无效写入。
- 允许仓库记忆不绕过 DSH 总禁用或 opt-in。被重定向 bank 的策略写入**解析前的 bank id**，而非重定向目标。

显示的是「已保存配置」；Hindsight 没有公开内部 workspace 缓存的实时状态，本插件不会猜测是否已生效。检测到工具注册也不等于记忆正在运行。保存后始终提示重启，不尝试热卸载上游钩子或中断活跃任务。

## 安全边界

- 通过 DSH `connection.fetch` 的认证通道处理请求，另检查 owner 身份；拒绝跨站请求和非 JSON 修改请求。
- 只允许编辑明确的布尔/三态字段，不接受任意文件路径、命令或凭据。
- 配置读取有 1 MiB 上限；非法 JSON、错误结构、符号链接均拒绝编辑，不自动修复或覆盖。
- 保存使用串行队列、同文件锁、revision 冲突检测、0600 临时文件和原子 rename，保留未涉及字段。锁协调使用此插件的进程；外部编辑器不遵守锁时，二次 revision 检查与 rename 之间仍存在极短的竞态窗口，建议不要同时手动编辑。
- 崩溃可能留下 `.dsh-hindsight-settings.lock`。只有确认没有保存进程后，才应手动移除该锁；插件不会强抢锁。
- 不向界面、日志、模型工具输出 token、完整配置或服务器地址。只读工具 `hindsight_settings_status` 查询与 UI 相同的状态逻辑；修改收集授权仅允许用户 UI 操作，不提供写工具。
- 不连接 Hindsight 服务器，不上传、读取或删除记忆。关闭配置不能取消已经提交到服务端的后台任务。

## 开发与兼容性

```bash
npm run build
npm test
```

客户端由 `src/client.js`、`src/style.css`、`src/locales.json` 构建为 `lib/client.js`；无安装脚本，无外部运行依赖，复用 DSH 自带 React。不要手动改生成文件。

设计采用 DSH 原生设置页的 20px 标题、13px 正文、轻边框和 36×20 开关（44px 点击区），完全使用语义主题 token；没有外部字体、iframe 或第二个应用壳。页面分为 DSH 总开关、仓库策略、保存状态和折叠诊断。禁用策略变化需要显式保存，冲突保留草稿，读写期间禁用重复提交。

最低声明版本为 DSH `0.2.2-rc.1`、Node.js 20。文件操作使用 Node 跨平台 API；macOS 实测结果以交付说明为准，Windows/Linux 未经原生 WebView 验收。bank 解析参照已安装的 Hindsight coding-agents 配置语义；上游未来更改语义时需同步契约测试。

图标为本插件原创 SVG，随 MIT 许可分发。
