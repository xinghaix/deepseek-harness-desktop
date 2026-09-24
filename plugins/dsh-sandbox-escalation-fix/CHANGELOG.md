# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.3] - 2026-09-24

### Added

- 新增插件图标 `icon.svg`（`package.json` 顶层 `icon` 字段），样式对齐官方 DSH 插件卡 36×36 矢量图标：沙箱 U 形边界 + 审批表单票据 + 向上 clearance 台阶，表达提权审批而非通用盾牌。

## [0.2.2] - 2026-09-24

### Changed

- 将 `peerDependencies` 从精确钉死的 `0.1.6-alpha.1`（`@deepseek-ai/dsh-agent`、`dsh-sandbox`、`dsh-sandbox-policy`、`dsh-tools`）与 cordis `4.0.2`，改为 `^0.1.7-rc.1` 与 `@deepseek-ai/cordis` `^4.0.4`，以便在 DSH `0.1.7-rc.1` 上原生通过兼容性检查，无需 `dsh plugin allow-version`。

### Fixed

- 修复 profile 启动时因 peer 版本不满足 `semver.satisfies` 而跳过本插件 bundle 的问题。

## [0.2.1] - 2026-09-20

### Changed

- 安装说明改为直接使用 GitHub 远程路径（`xinghaix/deepseek-harness-desktop#path:…`），无需先克隆仓库或从本地 `$PWD` 安装。

## [0.2.0] - 2026-09-20

### Added

- 将基于 [inmny/dsh-sandbox-escalation-fix](https://github.com/inmny/dsh-sandbox-escalation-fix) 的二次修改版本迁入本仓库 `plugins/dsh-sandbox-escalation-fix`。
- 忽略不高于 Session 当前权限的无效 `sandbox_permissions` 提权请求，并为缺失/空白的 `justification` 提供 fallback；覆盖 PTC 外层 `run_code` 以及 `bash` / `pwsh` / `write` / `edit` 等带提权字段的工具。
