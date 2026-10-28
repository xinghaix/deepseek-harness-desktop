# dsh-mcp-manager

管理当前 DSH profile 里的 MCP 连接。连接记录存入官方 `storageDomain`，运行时通过私有 Loader 子树创建 `@deepseek-ai/dsh-mcp-client` 实例；**添加服务器不再生成独立配置包，也不会让「已安装插件」列表每台服务器多出一行**。

页面在插件详情（`plugins.bundle.config`）里。页面和 Host 之间只走两条带登录态的 Host 路由（`ctx.connection.fetch.register`，cookie 会话 + Host/Origin 校验）：

| 路由 | 作用 |
| --- | --- |
| `GET api/dsh-mcp-manager/state` | 服务器列表（打码、工具详情、最近错误诊断）、各工作区的项目文件待确认行（打码）、模板清单 |
| `POST api/dsh-mcp-manager/action` | `save` / `remove` / `enable` / `reconnect` / `import` / `approveProject`，串行执行 |

本插件 `Config` 为空，不在 `cordis.patch.yml` 里留任何请求或密钥。

- 新建 / 编辑：先持久化连接记录，再创建或替换官方 MCP 客户端实例。自有服务器可在停用时编辑，创建后不能改名。连接失败时保留最新保存的记录与脱敏诊断供修正。
- 持久化：数据域 `mcp_manager_<profile 绝对路径的 SHA-256 前 16 位>`，`connections` 表按记录保存；不同 profile 互不串数据。默认官方 JSON 后端使用 0700 目录、0600 文件和原子写入。记录中的环境变量引用保持为引用，每次连接时再解析；不写回 profile patch 或 `desktop-state.json`。
- 开关 / 重连：持久化启用状态，通过私有 Loader 子树切换实例；重连前等待旧实例的异步销毁完成，避免两个同名进程或工具注册重叠。首次连接和工具发现最多等待 15 秒；超时取消并等待所属 fiber 清理，不遗弃后台连接任务。
- 生命周期：管理器停用、卸载或重载时回收自己创建的实例及工具注册，外部 MCP 不受影响；重载后根据记录恢复。
- 删除：移除自有连接实例和连接记录，不卸载官方 MCP 客户端包。外部手写行只能在启用时通过 `configEditor.edit` 编辑、通过官方插件管理器启停，不能在这里删除。

## 旧版本连接迁移

首次加载新版会识别旧管理器生成的 `@local/dsh-mcp-*` 配置包。校验本地包结构后，读取原始配置并保留环境变量引用、凭据、命令 / argv / cwd、URL、超时、项目来源和启停状态；先持久化迁移记录，再停用旧实例、验证新实例，最后通过官方插件管理器移除旧包依赖。

- 迁移需要 DSH 支持实时 profile 重组；没有 HMR 或连接验证失败时保留旧包，页面展示迁移警告，不强行移除。
- 运行时使用新 ID，避免与旧包贡献的行混淆；对未完成的迁移保留状态，重启可继续恢复。
- `<profile>/mcp-bundles/<name>/` 的原始文件保留为回退副本，但迁移成功后已不在 profile 包清单中，不再加载。
- 只接受旧管理器的包结构及 `process.env.NAME` 凭据引用，不执行任意 `!!js`，不接管用户手写的外部 MCP。
- 管理器自身完成激活之后才开始迁移，避免插件管理器的 HMR 等待启动 fiber 时与迁移互等。

本次设计参考了 [dsh-mcp-connector](https://github.com/duhu2000/dsh-mcp-connector) 的「连接记录 + 动态官方 MCP 客户端」分层，但不引入其市场、OAuth 或工具治理模块。

## 安装

直接从本仓库 GitHub 子目录安装：

```bash
dsh plugin --profile web add "xinghaix/deepseek-harness-desktop#main&path:/plugins/dsh-mcp-manager"
dsh plugin --profile web remove dsh-mcp-manager
```

本地开发也可以用绝对路径（会按依赖安装，比 `link:` 更稳）：

```bash
dsh plugin --profile web add /absolute/path/to/plugins/dsh-mcp-manager
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
- **项目作用域**：读取每个工作区的 `.dsh/mcp.json` 与 `.dsh/mcp.local.json`（各 ≤256 KB），显示为待确认行，**点「允许」/「全部允许」之前不连接**。允许时 Host 重新读文件、把条目保存成当前 profile 的连接记录（停用），同时保留来源 `{ scope: "project", workspace, file }`，页面显示「来自 … 已允许」
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
