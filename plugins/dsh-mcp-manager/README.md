# dsh-mcp-manager

管理当前 DSH profile 里的 MCP 服务器。每台服务器是一个官方配置包，插入 `@deepseek-ai/dsh-mcp-client`。本插件自己的配置不保存服务器清单。

页面在插件详情（`plugins.bundle.config`）里。页面和 Host 之间只走两条带登录态的 Host 路由（`ctx.connection.fetch.register`，cookie 会话 + Host/Origin 校验）：

| 路由 | 作用 |
| --- | --- |
| `GET api/dsh-mcp-manager/state` | 服务器列表（打码、工具详情、最近错误诊断）、各工作区的项目文件待确认行（打码）、模板清单 |
| `POST api/dsh-mcp-manager/action` | `save` / `remove` / `enable` / `reconnect` / `import` / `approveProject`，串行执行 |

本插件 `Config` 为空，不在 `cordis.patch.yml` 里留任何请求或密钥。

- 新建：写 `<profile>/mcp-bundles/<name>/`，再 `pluginManager.installBundle`。行 id 带一次性后缀（`dsh-mcp-<name>-<nonce>`），并在安装后显式设置启停：profile 会在删包后保留旧的启停覆盖，否则同名重建可能继承 `disabled: false`，跳过 stdio 确认直接启动。
- 编辑自有服务器：重写包内文件，再用 `setPluginEnabled(当前状态)` 让插件管理器从磁盘重读并 reconcile（已启用的会带新配置重启；若此前处于 `failed` 状态则先置 `false` 再置 `true` 确保重新激活 fiber）。保留的密钥按包内原文保留，`!!js process.env.X` 不会被解析成明文。自有服务器创建后不能改名。
- 编辑外部手写行：`configEditor.edit`，仅限启用状态（停用行没有 fiber，上游会拒绝）。
- 重连：对已启用服务器先置 `false` 再置 `true`，触发 `dsh-mcp-client` 重建连接与工具重同步。
- 删除：只删 `@local/dsh-mcp-*` 自有包；先停用再 `removeBundle`，留下的覆盖永远是 `disabled: true`。外部行不能在这里删。
- 开关：`setPluginEnabled`。

## 安装

优先用绝对路径（会按依赖安装，比 `link:` 更稳）：

```bash
dsh plugin --profile web add /absolute/path/to/plugins/dsh-mcp-manager
```

或从本仓库：

```bash
dsh plugin --profile web add "xinghaix/deepseek-harness-desktop#main&path:/plugins/dsh-mcp-manager"
dsh plugin --profile web remove dsh-mcp-manager
```

本地开发也可以在 web profile 的 `package.json` 里写：

```json
"dsh-mcp-manager": "file:/absolute/path/to/plugins/dsh-mcp-manager"
```

然后在 profile 目录执行 `pnpm install`（`file:` 会把包拷进 profile，**改源码后需再执行一次**才能进运行中的拷贝）。不要用裸的 `link:`：它不会安装依赖，Host 侧 `import "@deepseek-ai/schemastery"` 会失败。若必须用 `link:`，先在本插件目录执行 `pnpm install`（`@deepseek-ai/schemastery` 已列在 `dependencies`）。

装上之后重启使用该 profile 的 `dsh web`（桌面端：⌘Q 后重开）。

## 能力

- **DSH 0.2.1+ 原生适配**：导出 `locale/*.json` 包级多语言展示元信息（`PluginPackages.metaOf`）、顶层 `engines.dsh`、单次 `ctx.tools.schemas()` 扫描、同步 `workspaceRegistry.list()` 工作区读取及 `.dsh/mcp*.json` 的 `(mtimeMs, size)` 缓存
- **原生风格 UI 与交互**：复用 `@deepseek-ai/dsh-client-ui-primitives` 控件与 DSH 设计变量，支持整行点击展开、状态圆点 (`StateDot`)、服务器/工具实时过滤、工具胶囊悬停查看描述与点击一键复制完整工具名 (`mcp__<server>__<tool>`)、一键重连与连接失败脱敏诊断展示
- **添加 / 编辑 / 删除**：支持自有服务器增删改与 `toolCallTimeoutMs` 超时设置；外部手写行可在启用时编辑、可开关
- **stdio 启动确认**：启用（及已启用时改 command/argv/cwd）弹确认框，逐项列出 argv 与 cwd，勾选「已核对命令」后才能确认；streamable-http 不弹
- **密钥保护**：密码框输入（支持显隐切换），可写 `env:` 引用；离开后只显示已设置/未设置与引用名；URL 的 query、userinfo 以及错误诊断中的凭据自动打码
- **导入**：支持粘贴或选择 Claude/Cursor `mcpServers` JSON 文件；跳过 sse/ws/oauth/未知 type/裸 url 并逐条说明；`http`→`streamable-http`；`${VAR}` / `${env:VAR}` / `$VAR` 转成 env 引用；导入默认停用
- **项目作用域**：读取每个工作区的 `.dsh/mcp.json` 与 `.dsh/mcp.local.json`（各 ≤256 KB），显示为待确认行，**点「允许」/「全部允许」之前不连接**。允许时 Host 重新读文件、把条目复制成自有配置包（停用），包的 `package.json` 记下来源 `dshMcpManager.origin = { scope: "project", workspace, file }`，页面显示「来自 … 已允许」
- **模板**（只填添加表单，不自动执行，stdio 仍需确认）：filesystem、memory、everything、sequential-thinking（npx）、fetch、git（uvx）、github（官方远程 streamable-http，`Authorization` 走 `GITHUB_MCP_AUTHORIZATION` 引用）。带 `<占位符>` 的模板替换前不能保存
- **8 种语言**：zh-CN、en、de、fr、es、ja、ko、pt；缺 key 回退 en

## 开发

纯规则在 `lib/model.cjs`（Host + 测试的唯一真相），文案在 `lib/locales/*.json`。`scripts/embed-model.mjs` 把两者内联进 `lib/client.js` 的主工厂（`BEGIN/END EMBEDDED MODEL`、`BEGIN/END EMBEDDED LOCALES`），并同步生成 `locale/*.json` 包展示元信息。**不要手改嵌入段**；也不要再注册第二个 ModuleLoader id（profile 热重载会报 duplicate factory registration）。

```bash
pnpm test   # embed --check，再 node --test test/
node scripts/embed-model.mjs   # 改 model.cjs 或 locales 后重新嵌入
```

改源码后，在使用 `file:` 依赖的 profile 目录重新执行 `pnpm install`，再重启该 profile 的 `dsh web`（桌面端：⌘Q 后重开）。

`prototype.html` 是扔掉的入口原型，不是运行时实现。

## 上游缺口（本插件不绕）

- **按工具排除**：`dsh-mcp-client` 的 `syncTools` 对每个工具 `ctx.tools.register`，`Config` 没有 include/exclude；`dsh-tools` 没有注册前/可见性钩子；`restrict` 只接受 agent scope；`guard` 只拦调用、schema 仍对模型可见。需要上游在 `Config` 加 include/exclude，或提供全 agent 可见性 API。
- **OAuth / 旧 SSE / WebSocket**：`dsh-mcp-client` 的 `Config` 只有 stdio | streamable-http，`createTransport` 只传 `requestInit.headers`，不传 `authProvider`。SDK（`@modelcontextprotocol/client` 2.0.0）有 `SSEClientTransport` 与 OAuth 辅助，但没有 WebSocket。需要上游加 `sse` transport、OAuth provider（token 存储 + 回调路由）。不用静态 header 冒充 OAuth。

## 明确不做

marketplace 一键 npm exec、跨 agent 的 `tools.restrict` UI、第二套 MCP 协议客户端、resource/prompt 管理页、内嵌进 Wails。
