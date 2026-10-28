# dsh-prompts

统一管理当前 DSH Profile 下的**全局提示词（Global Prompts）**与**工作区级别提示词（Workspace Prompts）**。

## 核心特性

- **双端统一菜单与入口**：
  - **设置左侧一级导航**：注册 `settings.section`（`id: "dsh-prompts"`, `order: 22`），自动将默认齿轮替换为与官方线性图标一致的 16×16 `1.4px` 描边提示词图标；
  - **新版插件管理详情页**：注册 `plugins.bundle.config` 与 `plugins.row.config`（`view: "summary" | "page"`）；
  - **主边栏快捷面板（可选）**：支持在选项中按需开启 `sidebar.panellist` + `main`。
  - 三处入口共享同一套 `全局提示词` / `工作区提示词` / `生效预览 & 选项` 子导航栏与 `--dsw-alias-*` 语义色卡片样式。
- **DSH 原生工作区联动**：
  - 前端通过 `ctx.workspaces.list` 自动同步已注册工作区，联动 `ctx.sessions.list` 自动定位并高亮 `★ 当前会话` 所属工作区，支持 `ctx.uiWorkspace.pickDirectory()` 选择任意本地目录；
  - Host 端在每次模型推理前通过 `ctx.workingDirectory.get(session)` 获取当前会话实时目录（支持会话中途 `cd` 切换目录后立即切换工作区提示词），并按**最长父路径前缀**匹配最具体的工作区配置。
- **跨模型高遵循度与双黄金锚点**：
  - 支持将规则挂载在 **尾部黄金锚点**（`dsh-prompts:suffix`, `order: 10150`，紧贴对话历史之前，防忽略权重最高）或 **首部角色锚点**（`dsh-prompts:prefix`, `order: 100`），强制 `interpolate: false` 原样保留 `{{...}}` 占位符；
  - 自动包裹 `<user-custom-instructions>` XML + Markdown 混合高优先级信封与三级冲突裁决法则（用户当轮指令 > 工作区规则 > 全局规则 > 历史对话习惯），内置 4 套结构化标准模板（`MUST` / `NEVER` / `Trigger` / `Format`）。
- **全场景实时生效与清空防惯性状态机**：
  - 新增、修改、启停或清空提示词后，对**新会话**与**已有会话**的下一次模型推理立即生效；
  - 针对曾注入过自定义提示词的已有会话，清空后自动下发 `status="cleared"` 显式撤销信封，彻底消除多轮上下文惯性与 `in-history` 残留；从未注入过提示词的会话保持零 Token 开销。
- **8 语言完整支持**：内置 `zh`、`en`、`de`、`fr`、`es`、`ja`、`ko`、`pt` 静态包元数据（`locale/*.json`）与运行时字典（`lib/locales/*.json`）。

## 安装与开发

```bash
# 构建并校验 8 语言字典与客户端 bundle
npm --prefix plugins/dsh-prompts run build

# 运行完整单测（model + host + client）
npm --prefix plugins/dsh-prompts test
```
