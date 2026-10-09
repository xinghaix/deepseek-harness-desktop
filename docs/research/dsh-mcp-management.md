# dsh-mcp-manager：DSH 的 MCP 能力与管理插件方案

> 研究目标：确认 DeepSeek Harness 是否已经能连接并管理 MCP 服务，并给出可单独安装的插件 `dsh-mcp-manager` 方案。插件目录对齐本仓库 `plugins/`；v1 已实现，见「实现状态」。
>
> 口径：本机 `dsh` **0.2.0-rc.2**（`/opt/homebrew/bin/dsh`，包 `/opt/homebrew/lib/node_modules/@deepseek-ai/dsh`）。市面行为以 2026-09-30 抓到的官方文档为准。本文只记录结论和方案，不改产品源码。

## 结论摘要

1. **协议客户端已经有，管理面没有。** `@deepseek-ai/dsh-mcp-client@0.2.0-rc.2` 会连接外部 MCP 服务器，并把工具注册成 `mcp__<serverName>__<tool>`。默认不启用任何服务器。没有 `dsh mcp` 子命令，也没有 Chat 里的 MCP 设置页。
2. **资源发现已经在官方 profile 里。** `@deepseek-ai/dsh-mcp-resources` 随 base / sdk-minimal bundle 挂载，提供 `list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`。插件不应再做一套资源工具。
3. **传输只有两种：** `stdio` 与 `streamable-http`。没有独立的旧版 SSE、WebSocket、OAuth、MCP prompts、把 DSH 自己暴露成 MCP server。类型注释里的 “Streamable HTTP (SSE)” 不是第二种传输。
4. **官方添加一台服务器的方式**是在 profile patch 里 `insert` 一条 `@deepseek-ai/dsh-mcp-client`，或安装一个只有 `cordis.patch.yml` 的配置包。`ConfigEditor` 能改已有条目，**不能新建条目**；`pluginManager` 能安装/启用/卸载 bundle，以及开关已有行。
5. **因此 `dsh-mcp-manager` 应该是管理插件，不是第二个 MCP 客户端。** 它放在 `plugins/dsh-mcp-manager`，用与 `dsh-web-fetch-allowlist` 相同的 `dsh plugin --profile web add` 单独安装，不进桌面端二进制，也不自动启用。
6. **和市面的差距**主要是：表单化的增删改、启用开关、连接状态、从 Claude/Cursor JSON 导入，以及「当前仓库 / 当前用户」作用域。OAuth、旧 SSE、WebSocket、prompts、marketplace 没有客户端口。按工具排除在单个 `agent.ctx` 上已有 `tools.restrict()`，但 Host 插件没有公开方式对所有 agent 施加并管理这层掩码，第一版不做。

## 1. DSH 已经支持什么

来源是已安装包的 README 与 `lib/types`，不是博客转述。

| 能力 | 事实 | 来源 |
| --- | --- | --- |
| 角色 | DSH 是 MCP **客户端**。包列表里没有 `dsh-mcp-server`。`dsh --help` 只有 profile 启动和 `dsh plugin`（转给 pnpm），没有 `mcp` 子命令。 | `package.json` dependencies；`dsh --help` |
| 一台服务器一条插件 | 每个 `dsh-mcp-client` 实例连一台服务器。多台就在 `cordis.yml` / patch 里加载多份。 | `dsh-mcp-client/lib/types/index.d.ts` 文件头 |
| 传输 | `stdio`（`command` / `args` / `env` / `cwd`）或 `streamable-http`（`url` / `headers`）。SDK 优先 2026-07-28，再回退旧协议。依赖 `@modelcontextprotocol/client@2.0.0`。 | README.zh.md「最小配置」；`package.json` |
| 工具名 | `mcp__<serverName>__<rawName>`，与 Claude Code / Codex 同形。`serverName` 必须是 `[A-Za-z0-9_-]{1,32}`，同一注册作用域内唯一。`tools/call` 始终用原始名。 | README.zh.md「工具命名」 |
| 热更新 | 改配置项会原地重载连接，未改的名字保持不变。工具列表变更会整代替换；失败则保留上一组。断开后默认重连（500ms 起、上限 30s、连续 10 次放弃）。 | README.zh.md「启动、工具更新与重连」 |
| 超时 | `toolCallTimeoutMs` 默认 60000。连接/发现超时不单独暴露，沿用 SDK 60 秒。 | README 字段表与「已知限制」 |
| 环境 | stdio 子进程环境先洗掉名称匹配 `/KEY\|PASSWORD\|SECRET\|TOKEN/i` 的变量和全部 `DSH_*`，再合并配置里的 `env`。显式 `env` 可以覆盖。 | README「环境清洗」 |
| 图片 | PNG/JPEG/WebP/GIF 在模型支持图片且附件可用时进入对话。音频、嵌入资源只给诊断文本。 | README「调用工具」 |
| 资源 | 三个共享工具，调用时必须带 `server`。无订阅、无自动刷新。连接失败不撤掉共享工具，调用时报错。 | `dsh-mcp-resources/README.zh.md` |
| 不做的协议面 | MCP prompt 模板、资源订阅、task-based execution 工具（直接拒绝）、独立的服务器状态快照。 | 两份 README「已知限制」；mcp-client README 写明不发布工具映射快照 |
| 官方「加一台服务器」模板 | 配置包只需 `name`、`version`、`dsh.bundle.patch`。patch `insert` 已安装的 `@deepseek-ai/dsh-mcp-client`。密钥用 Loader `!!js`，不要把秘密写进对话。 | `dsh-agent-preset/.../references/mcp-bundle.md` 与 `templates/mcp/` |

最小官方配置（摘自客户端 README）：

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

本机 `/Users/xing/.dsh/profiles/web/cordis.patch.yml` 里**没有** `@deepseek-ai/dsh-mcp-client` 行。客户端在，但当前 web profile 没有配任何 MCP 服务器。

## 2. 管理面缺口（插件必须补的，以及补不了的）

已核对的 Host API：

- `ctx.configEditor.entries()` / `configuration()` / `edit()`：读写**已经存在**、且能被 profile 根 Include 唯一定位的条目。写入前校验，失败回滚，保留 `!!js`。不创建新行。Home patch 和命令行 `--patch` 不在写入目标里。（`dsh-config-editor/README.zh.md`，`lib/types/index.d.ts`）
- `ctx.pluginManager.listPlugins()` / `setPluginEnabled()` / `setBundleEnabled()` / `installBundle()` / `removeBundle()`：管 bundle 和已有行的开关，安装走和 `dsh plugin` 一样的 pnpm。没有「插入一条 loader 行」的方法。（`dsh-plugin-manager/lib/types/index.d.ts`）
- `writePluginEnabled()` 只会把匹配行改成启用或 `disabled`。（`patch.d.ts`）
- `ctx.tools.restrict({ allow?, deny? })` **不能**当本插件的按工具开关。见下文「按工具排除」。
- `ctx.plugin(plugin, config)`：Cordis 用来再挂一个插件 fiber。（`@deepseek-ai/cordis` 类型声明）

客户端 `index.d.ts` 导出的是命名空间插件：`name`、`inject`、`Config`、`apply(ctx, config)`。没有 status 服务，没有 list/reconnect 方法。连接是通是断，只能从「工具是否出现」和日志间接看。

Chat 侧搜过已安装的 `dsh-client-ui-*` 声明，没有 MCP 设置页。配置入口在 0.1.7 之后落在插件管理页，不在旧的 `settings.section`。本仓库 allowlist 插件用的是 `plugins.bundle.config`（`plugins/dsh-web-fetch-allowlist/lib/client.js`）。

## 3. 本仓库插件怎么单独安装

`plugins/` 里已有两个独立包，桌面端**不会**因为它们在仓库里就自动加载（sandbox 插件 README 写明了这一点）。

安装形态（allowlist README）：

```sh
dsh plugin --profile web add "xinghaix/deepseek-harness-desktop#main&path:/plugins/dsh-web-fetch-allowlist"
dsh plugin --profile web remove dsh-web-fetch-allowlist
```

包约定：

- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`
- `dsh.engines.dsh` 为 `>=0.2.0-rc.1`，peer 用 `^0.2.0-rc.1`，才能过 0.2 的 `semver.satisfies` 预检
- 需要设置页时声明 `dsh.client.inject`，并 `ctx.slots.register("plugins.bundle.config", ...)`
- 顶层 `icon` 指向 `icon.svg`，插件卡片才会有图标
- 改的是目标 profile 的依赖和 patch，不改 DSH 安装目录

桌面端拉起的是用户已安装的 `dsh web`。插件必须装进**那个进程使用的 profile**（本仓库默认是 `web`），装到 `tui` / `headless` 不会出现在 Chat 里。

## 4. 市面管理功能（2026-09-30 官方文档）

只记录管理面，不抄服务器实现。

| 能力 | Claude Code | Cursor | Gemini CLI | OpenCode | DSH 0.2.0-rc.2 |
| --- | --- | --- | --- | --- | --- |
| 添加 / 删除 | `claude mcp add/remove/add-json` | Customize 或 `mcp.json` | `gemini mcp add/remove` | 编辑 `opencode.json` | 手写 patch，或装配置包 |
| 列表 / 状态 | `claude mcp list/get`、`/mcp`：Connected / Needs auth / Failed / Disabled | 设置页；失败隔离在单台服务器 | `gemini mcp list`、`/mcp`，有连接状态 | 文档未描述状态面板 | 无状态 API，无面板 |
| 停用但不删除 | `/mcp` 开关，写入 `disabledMcpServers` | Customize 开关 | `gemini mcp enable/disable`；配置里也可不启用 | `enabled: false`，或 `tools` 里按名/glob 关掉 | loader `disabled: true`（无 UI） |
| stdio | 有；`--` 后面整段是命令 | `command`+`args`+`env` | `command`+`args`+`cwd`+`env` | `type: local`，`command` 是数组 | 有；args 不经 shell |
| HTTP | `http`，JSON 里 `streamable-http` 是别名 | Streamable HTTP | `httpUrl` | `type: remote` + `url` | `streamable-http` |
| 旧 SSE | 仍可 `--transport sse`；新版本对 HTTP 失败会回退 SSE。文档标明 SSE 已废弃 | 仍单列为一种传输 | `url` 即 SSE | 文档的 remote 未分开 SSE | **无单独 SSE** |
| WebSocket | `type: ws`，不能 OAuth | 未列为传输 | 未列为传输 | 未列为传输 | **无** |
| 静态 header / env | `--header`、`--env`、`${VAR}` | `headers`、`${env:NAME}`、`${workspaceFolder}` | `headers`、`$VAR` / `${VAR}` | `headers`、`environment` | `headers`、`env`；密钥推荐 `!!js process.env.*` |
| OAuth | `claude mcp login/logout`，DCR、预注册 client、固定回调端口 | `auth.CLIENT_ID/SECRET`，固定回调 URL | `gemini` OAuth 登录命令；另有 GCP SA impersonation | remote 401 自动 DCR，`opencode mcp auth` | **无**。只有静态 headers |
| 作用域 | local / project / user，另有组织 managed。project 在 `.mcp.json`，未信任仓库不能自己批准自己 | 项目 `.cursor/mcp.json`，全局 `~/.cursor/mcp.json`，另有团队下发和 allowlist | `--scope user\|project`（默认 project） | 一份 `opencode.json`（全局或项目配置文件，文档按文件写） | **只有 profile**（web/tui/headless/desktop 各一份用户 patch）。没有「这个 git 仓库」 |
| 导入 | `add-json`、`add-from-claude-desktop`（macOS/WSL，可选服务器，坏名字跳过） | 市场一键安装；JSON 与别的客户端同形 `mcpServers` | 手写或 `gemini mcp add` | 手写 | 无导入器 |
| 按工具开关 | 权限规则、tool search；组织可以限制 connector 工具 | 默认调用前确认；Run Mode 与终端同一套 | `includeTools` / `excludeTools`（exclude 优先） | `tools` 里按服务器名或 glob | 客户端把 `listTools` 全部 `register` 到全局层。`agent.ctx.tools.restrict()` **可以**挡住该 agent 继承到的这些工具。Host 上下文调用会抛错，也没有公开 API 替所有 agent 安装和管理这些掩码 |
| 资源 / prompts | `list_changed` 会刷新 tools、prompts、resources | Tools、Prompts、Resources、Roots、Elicitation、MCP Apps | 资源可列出并在对话里引用；prompts 变成 slash command | 文档聚焦 tools | 资源三个共享工具；**无 prompts、无订阅** |
| 自己当服务器 | `claude mcp serve` | 无（它是宿主） | 无 | 无 | **无** |

来源：

- [Claude Code MCP](https://code.claude.com/docs/en/mcp.md)（`/docs/en/mcp.md`，抓取时正文被截断在工具 schema 之前；上表所用的安装、作用域、OAuth、导入、`mcp serve` 都在截断前）
- [Cursor MCP](https://cursor.com/docs/mcp.md)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server.md)
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers.md)

上表四家已经覆盖「CLI 管理 + 编辑器 JSON + 开关 + OAuth + 项目/用户作用域」。下面是同日另外读到的一手页，不并进上表，避免把没读到的格子填成「有」。

| 产品 | 读到的管理能力 | 来源 |
| --- | --- | --- |
| Claude Desktop 快速开始 | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`，Windows `%APPDATA%\\Claude\\claude_desktop_config.json`。示例只有 stdio 的 `mcpServers.command/args`。文件系统操作前会请求批准。排错要求完全重启，并提到 `mcp-server-<NAME>.log`。该文没有 HTTP、OAuth、按工具开关 | [Connect to local MCP servers](https://modelcontextprotocol.io/docs/2026-07-28/develop/connect-local-servers.md) |
| Codex CLI | 公开配置站本次 `fetch failed`。`main` 的 `docs/config.md` 只指向该站。源码子命令是 `list/get/add/remove/login/logout`；`add` 写入 `~/.codex/config.toml`。stdio 为命令加 `--env`，HTTP 为 `--url`，另有 bearer 环境变量、OAuth client id/secret（`RedactedString`）、注册策略 `AUTO\|CIMD\|DCR`。读到的参数里没有 SSE、cwd、按工具列表。项目级 config **未核** | [mcp_cmd.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/mcp_cmd.rs) |
| Zed | 设置页 **Settings → AI → MCP Servers**，可从扩展安装或添加本地/远程。`context_servers` 用 `command/args/env` 或 `url/headers`。没有 `Authorization` 头时走 OAuth。状态点绿色表示 “Server is active”。文档写明支持 Tools 与 Prompts，以及 `tools/list_changed` 不必重启服务器。Tool Permissions 一节本次没有逐条抄 | [Zed MCP](https://zed.dev/docs/ai/mcp.md) |
| Cline | `~/.cline/mcp.json` 与扩展里的 `mcpServers`。传输是 stdio、Streamable HTTP（推荐）和 SSE (Legacy)。CLI 能列出启停状态，并能停用而不删除。该页没有写 OAuth 或按工具开关 | [Configuring MCP servers](https://docs.cline.bot/mcp/configuring-mcp-servers.md) |
| Continue | `config.yaml` 的 `mcpServers`，或工作区 `.continue/mcpServers/*.yaml`（也接受 Claude/Cursor/Cline 的 JSON）。`type` 为 `sse`、`stdio`、`streamable-http`。`env` 注入密钥，另有 secrets 专节 | [mcp.mdx](https://github.com/continuedev/continue/blob/main/docs/customize/deep-dives/mcp.mdx) |
| Cascade（原 Windsurf 文档） | `docs.windsurf.com/.../mcp.md` 于 2026-09-30 返回 307 到 Devin 文档。跳转后的页写 stdio、Streamable HTTP、SSE，三种都支持 OAuth；`~/.config/devin/mcp_config.json`；面板可关整台服务器；`disabledTools` 关单个工具；另有 Registry 与 Allowlist。这是文档站迁移后的正文，不是仍能直接打开的旧 Windsurf 页 | [Cascade MCP](https://docs.devin.ai/desktop/cascade/mcp.md) |
| VS Code | 标题页 [Add and manage MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers) 与 [MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) 能被索引到。HTML 被截断在导航，`.md` 为 404。**字段未核，不填能力** | 同上 |
| Goose | `goose-docs.ai/docs/mcp/` 404，与其 `llms.txt` 的链接不一致。仓库 `documentation/docs/guides/managing-tools/` 有 `index.md`、`tool-permissions.md`；guides 下还有 `mcp-elicitation.md`、`mcp-roots.md`。正文抓取失败，**不根据文件名填写能力** | [managing-tools](https://github.com/block/goose/tree/main/documentation/docs/guides/managing-tools) |

规范侧，安装的 `@modelcontextprotocol/client@2.0.0` 指向 [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/index.md)。该版标准传输只有 stdio 与 Streamable HTTP；2024-11-05 的独立 HTTP+SSE 已被取代。授权对实现可选：HTTP 应当走 OAuth 2.1，stdio 不应当走这套 OAuth，而应当从环境取凭据。dsh 的 `Client` 以 `capabilities: {}` 构造（`dsh-mcp-client/lib/index.js` 约第 596–608 行），不宣告 elicitation、sampling、roots、logging。

## 5. 方案：`plugins/dsh-mcp-manager`

### 5.1 定位

一个 **profile 级 MCP 管理插件**。运行时仍然调用官方 `@deepseek-ai/dsh-mcp-client`，不重写协议、不重写资源工具、不把 DSH 变成 MCP server。

它解决的是：不用手改 YAML，就能在 Chat 的插件页里添加、停用、重连、查看工具，并安全地从别的客户端导入配置。

### 5.2 安装

包名 `dsh-mcp-manager`。与现有插件相同，可单独安装、可单独卸载：

```sh
dsh plugin --profile web add "xinghaix/deepseek-harness-desktop#main&path:/plugins/dsh-mcp-manager"
dsh plugin --profile web remove dsh-mcp-manager
```

`package.json` 对齐 allowlist：

- `dsh.bundle.patch` → `cordis.patch.yml`，只 `insert` 自己（`id: dsh-mcp-manager`），**不**在 patch 里预插任何服务器
- `dsh.engines.dsh: ">=0.2.0-rc.1"`
- peer：`@deepseek-ai/cordis@^4.0.4`、`@deepseek-ai/dsh-mcp-client@^0.2.0-rc.1`、`@deepseek-ai/dsh-tools@^0.2.0-rc.1`
- `dsh.client`：`platform: web`，inject `slots`、`locale`、`configForms`，外加插件页要用的 `dsh-client-ui-plugin-manager`
- 设置挂在 `plugins.bundle.config`，键为包名 `dsh-mcp-manager`。不占用 `plugins.item`（那是官方设置页的槽）

装上之后要重启使用该 profile 的 `dsh web`（桌面端就是重启它托管的 DSH）。

### 5.3 运行时结构

```text
插件页 plugins.bundle.config
        │  installBundle / setPluginEnabled / configEditor.edit / removeBundle
        ▼
每台服务器一个配置包（官方 templates/mcp）
        │  cordis.patch.yml 里 insert 一条
        ▼
@deepseek-ai/dsh-mcp-client
        │  Loader 直接加载，不经过本插件的 ctx.plugin
        ▼
stdio 或 streamable-http、工具名、重连、洗环境、资源提供方
```

服务器写进原生 `@deepseek-ai/dsh-mcp-client`，不写在本插件自己的 config 里，也不另写 `mcp.json`。`configEditor` 不能新建条目，插件管理器也没有「插入一行」的方法，所以不手改用户的 `cordis.patch.yml`。添加一台服务器 = 按官方模板生成一个只有 `package.json` 和 `cordis.patch.yml` 的配置包，用 `installBundle` 装进当前 profile。之后用 `configEditor.edit` 改已有 config，用 `setPluginEnabled` 开关，用 `removeBundle` 删除本插件装上去的那一个包。

这样卸载或停用 `dsh-mcp-manager` 不会卸掉这些服务器。Loader 仍然加载那些 `dsh-mcp-client` 行，工具继续注册。本插件只是管理页；重装后通过 `configEditor.entries()` 再把这些行列出来。代价是每添加或删除一台都走一次 pnpm。

`ctx.plugin(mcp-client, config)` 只是把客户端挂在本插件的 fiber 上，本插件一卸连接就没了。不拿它当落盘方式。

曾经考虑把清单放在本插件自己的 config 里，这样添加和删除不用走 pnpm。不采用。卸掉管理插件后那些服务器会停，而这里要求它们继续由 Loader 加载。web profile 的 `patchReload` 是 `live`，官方配置包在 DSH 已运行时也能当场生效，不必为了免重启改回本插件保存。pnpm 只发生在添加和删除配置包；改已有行和开关不走 pnpm。

已经手写在 profile patch 里的 `dsh-mcp-client` 行同样列出来。能唯一定位的可以改 config、可以开关。它们不是本插件装的配置包，页面上不能删除。

推荐字段（全部能映射进官方 `Config`，不发明协议字段）：

| 字段 | 说明 |
| --- | --- |
| `id` | 这一行在 patch 里的插件 id，不等于 `serverName` |
| `enabled` | 这一行的 `disabled` 开关，走 `setPluginEnabled`。停用保留配置，不卸载包 |
| `serverName` | 原样交给客户端，规则不变 |
| `transport` | `stdio` 或 `streamable-http` |
| `command` / `args` / `cwd` | stdio。`args` 是数组，禁止拼成一条 shell 字符串 |
| `url` / `headers` | HTTP |
| `env` | 值要么是字面量，要么是单个环境变量引用，落盘写成 `!!js process.env.NAME` |
| `toolCallTimeoutMs` / `failOnStartupError` / `reconnect` / `maxInstructionBytes` | 可选，缺省用客户端默认值。不放进第一版表单 |

常见 `mcpServers` 配置和已安装的 `@deepseek-ai/dsh-mcp-client@0.2.0-rc.2` 的交集才出现在页面上。DSH 没有的字段不展示，也不另写一层去模拟。

| 常见配置 | DSH | 页面 |
| --- | --- | --- |
| `type: stdio`，或省略 type 但有 `command` | `transport: stdio` | 传输单选「stdio」 |
| `command` / `args` / `env` | 有。`args` 必须是 `string[]`，不经 shell | 展示 |
| `cwd` | 有，常见 JSON 示例里通常不写 | 展示 |
| `envFile` | 没有 | 不展示。导入时丢掉该字段，不读 `.env` |
| `type: http` 或 `streamable-http`，加 `url` / `headers` | `transport: streamable-http` | 展示。导入时把 `http` 写成 `streamable-http` |
| `type: sse` | 没有单独的旧版 SSE。类型注释里的 “Streamable HTTP (SSE)” 仍是上面这一种 | 不展示。整台跳过 |
| `oauth` / `auth` | 没有 | 不展示。整台若除此之外没有可映射的 `command` 或 `url`，就跳过 |
| WebSocket | 没有 | 不展示，整台跳过 |

规范侧，这版客户端使用的 `@modelcontextprotocol/client@2.0.0` 对应 [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/index.md)，标准传输就是 stdio 和 Streamable HTTP。上面表里多出来的 SSE、OAuth、`envFile` 是各家客户端配置的超集，不是这版 DSH 能连接的传输。

已有的、不是本插件创建的 `dsh-mcp-client` 行（手写 YAML 或配置包）要在列表里显示为**外部行**：可以看、可以用 `setPluginEnabled` 开关（该行可被 profile patch 定位时），不能被本插件的「删除」擦掉。避免两套写入把用户的 `!!js` 覆盖掉。

停用一台服务器 = `setPluginEnabled(false)`，配置包还在。删除 = 只对本插件安装的配置包调用 `removeBundle`。重连 = 改 config 触发客户端自己的原地重载；若该 profile 不是 live reload，则说明需要重启 `dsh web`。官方客户端自己的断线重连预算仍然有效。

### 5.4 页面

要做的事如下。入口是插件详情（`plugins.bundle.config`），不新开设置一级导航。点列表中的一行，表单在该行下面展开。不用右侧抽屉，也不做设置侧栏。

- 列表：`serverName`、传输、启用开关、工具名、最后一次错误（见 5.5）。折叠放在行尾。收起时也显示工具名，一行放不下的进入「更多」。「更多」和展开都只打开工具名单。连接配置默认收在「编辑连接」里，要改时再展开。新添加的一台直接打开编辑。每一行都有删除，不必先展开；外部行的删除不可用。重启和保存在展开区
- 编辑：在当前行下方展开，按传输切换表单。保存前用官方 `Config` schema 校验。`serverName` 为空、不符合 `[A-Za-z0-9_-]{1,32}`、或和已有服务器同名时拒绝保存，也拒绝启用，并在名称下面写一句原因。导入时同一份 JSON 里的重名，以及和已配置服务器同名的，都在预览里标成跳过，不重复添加
- stdio 从停用改为启用：总是弹出确认。已经启用时，若 `command` / `args` / `cwd` 与上次确认的不同，保存或重连前也要确认。取消则还原成上次确认的值。停用期间修改并保存不会启动进程，不弹框；下次启用时确认当时的 argv。对话框逐项展示 argv：第 0 项是 `command`，其后每一项对应官方 `args: string[]` 的一个元素。不拼成 shell 字符串，也不按空格再切开。`cwd` 单独列出，不算 argv 元素。导入来的服务器默认 `enabled: false`
- 密钥：stdio 的 `env` 和 HTTP 的 `headers` 都可以添加。每一项填名称，值用密码框输入；离开后只显示「已设置 / 未设置」和名称。「更换」是再输入一次新值，不回显旧值。诊断、导入预览和原型底部状态同样打码
- 工具：只读列出当前 `ctx.tools` 里该 `serverName` 前缀的公开名。没有勾选、没有 `excludeTools`
- 导入：粘贴或选择一份 JSON 文件，不扫整个主目录。识别 `mcpServers` 对象（Claude、Cursor、Claude Desktop 同形）。只映射上表能落地的字段。只有显式的 `type: http` 或 `streamable-http` 收成 `streamable-http`。没写 `type` 但有 `url` 的不默认转换。写了认不出的 `type`（例如 `ws1`）整台跳过，不能因为带着 `url` 就导入。`envFile` 丢掉且不读文件。`sse` / `ws` / 只含 `oauth` 或 `auth` 的整台跳过并说明原因。输入下面是一份待确认清单，不是立即启动

文案至少中英，走 `dsh-client-locale`。个人服务器配置只留在本机 profile，不进仓库。

### 5.4.1 入口原型

已选定：插件详情里的服务器列表，点一行在下面展开编辑。不用右侧抽屉，不新增设置一级导航，也不把每台服务器的表单同时摊开。控件对齐官方 primitives：主按钮实心底，次按钮 0.5px 描边，开关 36×20 且打开时用品牌色而不是业务蓝，展开用 chevron，打开后转 180°，未展开的行本身不铺灰底。悬停和展开都是直角，展开块顶边贴住上一行的分割线，不再留空隙。页面不写「只读」和「不能指定哪些生效」。展开后的整块（标题行加下面的内容）用比页面更深的底，和上下行分开。确认弹层对齐官方 Modal：点遮罩、Esc、右上角关闭都是取消；底部先是描边「取消」，再是确认。删除的确认是红色实心按钮。启动本地进程还要先勾选「已核对命令」，确认才可点。临时页面是 [plugins/dsh-mcp-manager/prototype.html](plugins/dsh-mcp-manager/prototype.html)，不再用 `?variant=` 切换。这是扔掉的原型，不是插件实现。

原型只改页面内存，不写 profile。确认规则与上面一致：启用 stdio 必确认；已启用的 stdio 在保存或重连时，若 `command` / `args` / `cwd` 变了，先确认，取消则还原。`args` 按官方 `string[]` 逐项编辑；确认框一行一个 argv 元素，含空格的参数保持为一项。状态用词遵守 5.5，不出现「已连接」。

### 5.5 状态，诚实显示

官方客户端不提供状态对象。第一版状态只允许这些，条件不变，不另做连接探测。界面文案走 locale 目录，语言与桌面壳一致：`zh-CN`、`en`、`de`、`fr`、`es`、`ja`、`ko`、`pt`，缺词回退 `en`。

| 文案键 | zh-CN | 条件 |
| --- | --- | --- |
| `status.disabled` | 已停用 | `enabled: false` |
| `status.failed` | 连接失败 | 该 `dsh-mcp-client` 行加载或初始连接失败，展示错误文本并打码 |
| `status.connected` | 连接成功 | 工具表里存在 `mcp__<serverName>__*` |
| `status.empty` | 已加载但无工具 | fiber 起来了，但没有该前缀的工具（服务器可以合法地没有 tools） |
| `status.unknown` | 未知 | 以上都不是。不要把「未知」画成连接成功 |

列表按钮同样走目录：`add`（添加）、`import`（导入）、`count`（总共 {total} · {enabled} 启用）。

日志沿用 DSH 自己的日志。插件不把 header、env 值、URL query 打出来。

### 5.6 作用域，分阶段对齐市面

| 市面 | 第一版 | 后续 |
| --- | --- | --- |
| User（所有项目） | **就是本插件 config**，跟随 profile。桌面 Chat 用 web profile | 不变 |
| Project（可提交） | **已实现（见实现状态）** | 工作区 `.dsh/mcp.json`。未点「允许」之前不连接，对齐 Claude 对 `.mcp.json` 的批准，而不是仓库自己把自己批成可信 |
| Local（只此仓库、不共享） | **已实现** | `.dsh/mcp.local.json`，文档要求 gitignore |
| 组织下发 / allowlist | 不做 | 没有 DSH 的 managed-settings 面，不要在插件里发明管理员通道 |

项目文件如果做，也只是**读入后写成「待确认」**，确认后仍复制进本插件 config（或运行时合并）。主存储仍然是 profile patch，避免工作区文件和 Loader 各写各的。

### 5.7 和现有审批的关系

MCP 工具经 `ctx.tools.register` 进入同一套工具表，但 `createMcpToolDefinition`（`dsh-mcp-client/lib/index.js` 约第 179–197 行）没有 approval 或 sandbox 字段，实现里也没有调用 `dsh-user-approval`。因此不能写成「每次 MCP 调用都会弹批准」。`dsh-user-approval` 只处理已经声明要询问的动作。插件不要再做一套平行弹窗；若要让 MCP 调用默认询问，那是上游给工具定义加钩子，不是本插件在桌面桥接里拦截。

服务器级开关是连接闸门，不是按工具过滤，也不等于放宽沙箱。stdio 会在本机执行用户确认过的程序，这和用户自己把同一段 YAML 写进 patch 是同一信任级别，插件只是让确认发生在界面上。

不要从桌面桥接加「执行这条命令」的 RPC。连接只发生在已经加载本插件的 DSH Host 里。

### 5.8 明确不做

- 自己实现 MCP 握手、stdio 帧、HTTP 会话
- 再注册一套资源工具或 prompt 模板 UI
- `dsh mcp serve` / 把会话工具暴露给外部客户端
- OAuth / DCR / 浏览器登录（客户端没有这个口；用静态 header 冒充登录会把 refresh 做坏）
- 旧 SSE 自动回退、WebSocket
- 从插件市场一键安装任意 npm 包并执行（这是任意命令执行）
- 改写用户已有的 `dsh-mcp-client` YAML，除了经 `setPluginEnabled` 的开关
- 随桌面端默认启用，或把插件打进 Wails 资源
- 在本插件里做跨所有 agent 的按工具排除。单个 agent 的 `tools.restrict()` 仍然可用，但不由本插件包办。理由见「按工具排除」

上游如果以后给 `dsh-mcp-client` 加了 OAuth 或状态服务，插件改为调用那个 API，不保持一套分叉实现。


## 按工具排除：不由本插件跨 agent 管理

市面（Gemini 的 `includeTools` / `excludeTools`，OpenCode 的 `tools` glob）是宿主级开关：一台服务器的部分工具对所有会话不可见。DSH 已有的是**单个 agent** 的掩码，不是 Host 插件能统一管理的开关。本插件不实现后者。

已经核对过的实现：

- `dsh-mcp-client` 在 `syncTools` 里对 `listTools` 的每一项调用 `ctx.tools.register`。`Config` 没有 include / exclude，也没有 `tools/pre-register`。（`dsh-mcp-client/lib/index.js` 的 `syncTools`；`lib/types/index.d.ts` 的 `Config`）
- 无 agent 作用域时，`register` 写进**全局**工具层。（`dsh-scope` 的 `layers.effect`：`scopeOf(ctx)` 为空则 `layer = this.global`）Host 插件以及从它 `ctx.plugin` 挂出的客户端走这条路径，除非另有代码打上 agent scope。全局层的名字会被 agent **继承**。
- `agent.ctx.tools.restrict({ allow?, deny? })` 是公开且支持的。它过滤该 agent 继承到的全局工具和祖先层工具，所以可以挡住上面这条路径注册的 MCP 工具，并且只影响这一个 agent。掩码取交集。该 agent **自己这一层**注册的工具仍然可见；把那些本地名字写进 allow/deny 会报未知全局工具。（`dsh-tools` README.zh.md「按 agent 限制工具」；`ToolRestriction`；`view()` 的 `restrictableNames`）
- 被拒绝的只是**没有 scope 的那一次调用**：`scope === undefined` 时抛出 `tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent`。（`dsh-tools/lib/index.js` 的 `restrict`）这不等于「对每个 agent 各调用一次也被 API 拒绝」。
- Host 插件缺的是把这些 per-agent 掩码**施加到所有 agent 并持续管理**的公开方式：没有列出 agent scope、挂上由插件拥有的 restriction、并在 agent 出现或工具列表变化时更新它的 API。从插件里自己遍历 agent 去调用，是在补这个管理面，不是在用已有的管理口。本插件不这么做。
- `tools.guard()` 可以从无 scope 的上下文全局拒绝调用，但 schema 仍在。模型还是看得到工具。不用它顶替按工具排除。

agent preset 如果自己拿着 `agent.ctx`，可以继续用 `tools.restrict()` 过滤它继承到的 MCP 工具。那不是 `dsh-mcp-manager` 的页面。要做成 Gemini 那种「所有 agent 都看不见」的勾选，需要上游在注册前过滤，或提供明确的全 agent 可见性 API。在那之前，插件只读展示工具名。

## 6. 开工前必须做的 spike

落盘路径就是官方配置包，不再把 `ctx.plugin` 当备选。写页面之前用一个最小 Host 插件验证，不要边做 UI 边猜：

1. 用官方 `templates/mcp` 生成一个本地配置包，`installBundle` 之后 profile 里出现一条 `@deepseek-ai/dsh-mcp-client`，`ctx.tools` 能看到 `mcp__<serverName>__*`。
2. `removeBundle` 删的是这个配置包，不是 `@deepseek-ai/dsh-mcp-client` 本体。卸掉 `dsh-mcp-manager` 后，这条服务器还在。
3. 同一 `serverName` 第二份会在加载时失败，而不是悄悄覆盖。
4. `configEditor.entries()` 能列出手写行和配置包插入的行。`setPluginEnabled` 对这两种行返回 `applied` 还是 `restart-required` / `overridden`。`configEditor.edit` 能改配置包插入的那条 config，并保留 `!!js`。

不要手改用户的 `cordis.patch.yml`。`configEditor` 和插件管理器也写这个文件，直接拼接会丢 `!!js` 或互相覆盖。Spike 不要在 Host 上下文调用 `tools.restrict()`：无 scope 时会抛错。

### 6.1 Spike 结果（2026-10-09，本机 `dsh` 0.2.0-rc.2 / web profile）

1. **配置包安装**：用 `model.bundleFiles` 生成 `@local/dsh-mcp-spikev1`（stdio、`disabled: true`、argv 逐项、无密钥）。`dsh plugin --profile web add /tmp/…/spike-bundle` 后，`package.json` 的 `dsh.profile.bundles` 与 `dependencies` 都出现该包；包内 `cordis.patch.yml` 为官方形态的 `insert` `@deepseek-ai/dsh-mcp-client`。临时 `dsh web` 能正常启动（无 HARNESS 插件失败）。因默认停用，未拉起 stdio，故本轮未观察 `mcp__spikev1__*` 工具名；启用后的工具注册仍由官方客户端负责，与 README 一致。
2. **删除配置包**：`dsh plugin --profile web remove @local/dsh-mcp-spikev1` 只去掉该包与 bundles 条目，profile 里的 `@deepseek-ai/dsh-mcp-client`（随 base 提供）仍在。管理插件 `dsh-mcp-manager` 保持 `file:` 依赖未被动到。
3. **同名 serverName**：管理页在保存/启用前用 `model.nameIssue` 拒绝重名（单测覆盖）。另装第二份配置包（不同 package/row id、相同 `serverName: spikev1`、均 `disabled`）可以被 package manager 装上；真正冲突发生在客户端加载/启用阶段。v1 UI 不会主动写入第二份同名。
4. **读写面**：Host 侧 `inject = [configEditor, pluginManager, tools]`，快照走 `configEditor.entries()` + `pluginManager.listPlugins/listBundles` + `tools.schemas()` 前缀过滤；开关走 `setPluginEnabled`，编辑走 `configEditor.edit`，密钥合并用 `mergeSecrets` 保留 `__jsExpr`（单测覆盖）。web profile 的 `patchReload: live`，改已有行期望 `applied`；具体返回值以运行时 `view.application` 为准（页面会显示 applied / restart-required / overridden / failed）。

浏览器核对：临时 `dsh web` + headless Chrome 下 `dsh-mcp-manager` 激活成功（修复 `remote` inject 与 model 嵌入之后）；导入预览依赖的 `require("dsh-mcp-manager/model")` 为同步必选，materialize 成功即表示 model 可用。

## 实现状态（2026-10-09，第三轮）

`plugins/dsh-mcp-manager`（0.2.0）已按本方案落地。本机 web profile 依赖为 `file:/…/plugins/dsh-mcp-manager`。

**通道。** v1 曾用 `configForms` 的 volatile `request`/`view` 传话。e2e 发现两个问题：请求（可能含 env/header 值）会被当作用户配置持久化进 `cordis.patch.yml`；Host 的 `writeRef` 对普通对象 config 无效，列表永远为空。已改为两条带登录态的 Host 路由（`connection.fetch.register`）：`GET api/dsh-mcp-manager/state`、`POST api/dsh-mcp-manager/action`，插件 `Config` 为空。浏览器端把 `model.cjs` 与 8 份 locale 内联进主工厂；单独的 ModuleLoader id 会在 profile 热重载时报 duplicate factory registration，已去掉。

**写入。** 新建 = 写配置包 + `installBundle`；编辑自有包 = 重写包文件 + `setPluginEnabled(当前状态)`（`installBundle` 对已装的 link 报 `ambiguous-install`；`setPluginEnabled` 每次都从磁盘重读全部 patch 并 reconcile；`configEditor.edit` 要求 entry 有 fiber，停用行会报 “Configuration entry is no longer available”）；编辑外部行 = `configEditor.edit`（仅启用时）；删除 = 先停用再 `removeBundle`。

**发现并修复的安全问题。** `removeBundle` 不清 profile 里该行的启停覆盖。若服务器在启用状态被删，再用同名重建，新包会继承 `disabled: false`，stdio 程序**不经确认直接启动**（e2e 复现：重建后状态即 connected）。修复：行 id 带一次性后缀；删除前先停用；安装后显式设置启停。复测：删后覆盖为 `disabled: true`，重建为停用且无子进程。

**e2e（临时 `DSH_HOME` + `dsh web` + headless Chrome，未碰桌面端进程）。**

1. stdio（本地无密钥 MCP 服务器，工具 `echo`/`add`）：开关 → 确认框列出 argv `node`、`/tmp/…/stdio.mjs`，未勾选时确认按钮禁用 → 勾选确认 → `data-status="connected"`，工具 `mcp__e2estdio__add`、`mcp__e2estdio__echo`，服务器日志收到 `initialize`/`tools/list` → 关闭后子进程退出 → 删除后包目录、`package.json` 依赖都消失。
2. 编辑：停用时改 argv 生效；启用时改 argv，子进程以新参数重启；`env:` 引用在子进程环境里解析为引用的值，保留的字面量没有回传页面。
3. streamable-http（本地 `http://127.0.0.1:38411/mcp`）：表单添加，不弹确认；启用后 connected、工具 `add`/`echo`；带 query 的 URL 在页面显示为 `…/mcp?…`，原样保存；不改打码 URL 时保留原 URL。关闭、删除正常。
4. 项目作用域：临时工作区 `.dsh/mcp.json`（stdio + sse + http）与 `.dsh/mcp.local.json`（含字面 env 值）。页面按工作区列出，sse 显示跳过原因，允许前没有任何进程启动；「全部允许（3）」后生成 3 个停用的自有包，`origin` 记录工作区与文件，行内显示「来自 … 已允许」；state 响应里不含字面 env 值。
5. 全程浏览器无异常、无插件激活失败；用户 profile 的 headless 启动检查：无 Failed to load，`state` 返回 200。

**按工具排除：上游缺口，未实现。** 见「按工具排除」一节；结论不变。具体缺的是：`dsh-mcp-client` `Config` 的 include/exclude（在 `syncTools` 注册前过滤），或 `dsh-tools` 的全 agent 可见性 / `tools/pre-register` 钩子。`guard` 只拦执行，`restrict` 必须带 agent scope，均不采用。

**OAuth / 旧 SSE / WebSocket：上游缺口，未实现。** `dsh-mcp-client` 的 `Config` 只有 stdio | streamable-http；`createTransport` 只构造 `StdioClientTransport` 或带 `requestInit.headers` 的 `StreamableHTTPClientTransport`，不传 `authProvider`。SDK 2.0.0 自带 `SSEClientTransport` 与 OAuth（`authProvider`、`withOAuth`、`startAuthorization`），没有 WebSocket transport。要支持需上游在 `Config` 加 `sse` transport 与 OAuth（provider、token 存储、回调路由）。导入时这三类逐条跳过并说明原因。替代：模板（只填表单，github 远程模板的 `Authorization` 走 env 引用，是用户自备的 PAT，不是 OAuth）。

**本地化。** zh-CN、en、de、fr、es、ja、ko、pt 共 101 个 key，单测校验 key 与占位符一致，缺失回退 en。

若当前 `dsh web` / Desktop 在改依赖之前已经启动，需要 ⌘Q 后重开一次。

## 7. 建议的实现顺序

1. Spike（第 6 节），把结果补进本文档。
2. 包骨架、空插件页。服务器数组不放进本插件 config，只列出已有的 `dsh-mcp-client` 行。单元测试不连网。
3. 添加 / 编辑 / 删除 / 启用 / 重启，stdio 确认，密钥打码。
4. 只读工具列表。外部行只读 + 开关。不做按工具排除。
5. 导入 `mcpServers` JSON，不支持的字段逐条说明，默认不启用。
6. `.dsh/mcp.json` 的项目作用域和批准闸门（已完成）。

测试至少覆盖：`serverName` 非法、重名、stdio args 不被 shell 拼接、导入时丢弃 sse/ws/oauth、预览里没有密钥值、`enabled: false` 生成的配置包带 `disabled` 而不是调用 `ctx.plugin`。

## 8. 设计约束（实现时不要再议）

- 插件目录是本仓库 `plugins/dsh-mcp-manager`，安装单位是 DSH profile，不是桌面端内嵌。
- 协议行为以 `@deepseek-ai/dsh-mcp-client` 的 `Config` 为准；客户端没有的字段不要出现在「保存并连接」里。
- 每台服务器是一个官方配置包，插入原生 `@deepseek-ai/dsh-mcp-client`。本插件自己的 config 不保存服务器清单。手写行可以看、可以改、可以开关，不能删除。
- 秘密用环境变量引用，诊断打码，导入默认不启动。
- 资源工具继续用官方 `dsh-mcp-resources`，不重做。MCP 工具今天没有单独的审批字段；不要假装已经有。
- 不在本插件里跨所有 agent 管理 `tools.restrict()`。单个 `agent.ctx` 的掩码保持原样。也不要用 `tools.guard()` 假装把工具从模型视野里拿掉。

## 设计输入

下面是约束，不是已经存在的管理 API。第 5–7 节是在这些约束上的插件形状；第 6 节的配置包安装还没跑过。

1. 目标包在本仓库 `plugins/dsh-mcp-manager`，用 `dsh plugin --profile web add` 装进用户 web profile。不捆绑第二份 `dsh`，不写进桌面 `--patch`（`webview-boot`、`desktop-bridge` 在 profile 之后覆盖同 id；见 `internal/dsh/webviewboot_test.go`）。
2. 协议客户端、`mcp__<server>__<tool>` 命名、重连、stdio 环境清洗、三个资源工具已经在 `0.2.0-rc.2`。插件默认不替换 `@deepseek-ai/dsh-mcp-client`。
3. 公开写口只有已有行的 `configEditor.edit`，以及已有行/bundle 的启停和 `installBundle` / `removeBundle`。没有公开的「插入一条 mcp-client」。新服务器走官方配置包，由包里的 patch 去 `insert`。`ctx.plugin()` 不作为落盘方式。
4. MCP `Config` 不是 volatile，设置表单不会画出这些字段。`env` / `headers` 落在 profile patch 里就是明文，除非写成 `!!js process.env.NAME`。界面和日志都要打码。
5. 传输只有 `stdio` 与 `streamable-http`。旧 SSE、WebSocket、OAuth、prompt 模板、资源订阅、elicitation、sampling、roots 都不在桥的能力宣告里。
6. 本机 web profile 的 `dsh.profile.patchReload` 为 `live`，改已有条目会按客户端 README 原地重载。`desktop` profile 的 `package.json` 没有这个键。不要假设每个 profile 都热重载。
7. stdio 配置就是本机命令执行。桌面桥接继续没有任意 shell。插件只把配置交给已经加载的 DSH Host，不在 bridge RPC 里 spawn。
8. 调查时本机 web profile 没有启用中的 MCP 服务器。`~/.dsh/cordis.patch.yml` 里只有一段被注释掉的 `cua-driver-mcp`，安装包中没有那个包。不要把某次会话的服务器列表当成默认值。
9. 对照的安装包是 `0.2.0-rc.2`（上游标签 `dsh-v0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`），不是调查日的 `master`。`master` 若已增加 insert API 或 OAuth，要重新对一次。
