# DSH 第三方插件索引

该索引在 `xinghaix/deepseek-harness-desktop` 自己的 GitHub Pages 发布，不需要新仓库。Pages 只托管索引和图标；插件从本仓库的固定 Git 提交安装。能力增强、桌面桥接和 WebView 启动补丁是桌面专用组件，不在索引中。

## 添加索引

首次部署成功后，在 DSH 的 **插件 → 实验性插件** 中开启 **自定义插件索引**（早期版本叫「自定义插件市场」），进入 **发现 → 添加索引源**，粘贴：

```text
https://xinghaix.github.io/deepseek-harness-desktop/index.json
```

「发现」从 DSH `0.2.1-alpha.4` 起随附；可安装版本由各插件单独声明，例如 Hindsight 记忆设置需要 `0.2.2-rc.1` 或更高。安装前请核对 DSH 显示的仓库和提交；若 DSH 单独提示审批依赖构建脚本，请先核对脚本再决定是否允许。已从本地路径、分支或其他仓库安装的同名版本，不会自动迁移到索引来源。

## 详情页提示无法连接

「发现」能加载列表和图标，不代表能读取详细介绍。索引由 GitHub Pages 提供；对 GitHub 上的 Git 安装条目，DSH Host 还要从 `raw.githubusercontent.com` 读取固定提交的语言文件和详情文档。如果提示无法连接，检查该域名是否能从 **DSH 进程**访问，而不是只在浏览器里测试。DSH 不读取 macOS 系统代理开关；需要代理时，可在启动环境或实际使用的 `DSH_HOME/.env` 中配置 `HTTPS_PROXY` 为代理的 HTTP 地址，重启 DSH 服务后再点「重试」。详细介绍读取失败不等于插件未安装。

## 发布与维护

1. 首次发布：到仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。索引改动进入 `main` 后会自动部署，也可从 `main` 手动运行 [Plugin Index](https://github.com/xinghaix/deepseek-harness-desktop/actions/workflows/plugin-index.yml)。此工作流不触发桌面应用发版，不使用其更新签名密钥。
2. 发布新的插件版本：提高该插件的 `package.json.version`，确认该提交包含 bundle patch、可加载的构建产物和图标。将插件提交合入 `main`，再向[发布清单](<releases.json>)追加一组记录，写入该提交的完整 SHA、`plugins/` 下的目录名和精确版本；不要改写已经发布的版本指针。一个提交可以发布多个插件。源码改动未进入清单时不会被自动上架。
3. 生成器从固定提交读取包名、版本、图标和多语言展示文案，并以提交时间作为索引时间。`engines.dsh` 优先读取包的顶层字段，否则使用一致的 DSH peer 范围；如果 peers 不一致，请先给插件声明经过验证的顶层范围。索引会用 DSH `0.2.1-alpha.4` 和 `0.2.2-rc.5` 的官方校验器验证格式；这不替代逐个插件的安装和激活验证。

在仓库根目录本地生成和校验（Node.js 24、Git 完整历史）：

```sh
cd plugin-index
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
```

默认生成到仓库的 `dist/plugin-index/`。Pages 工作流使用临时输出目录，只上传其中的静态文件。PR 会构建并校验，但不部署。
