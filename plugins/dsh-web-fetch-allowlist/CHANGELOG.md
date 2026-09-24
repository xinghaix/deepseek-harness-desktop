# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-09-24

### Changed

- 适配 DSH `0.1.7-rc.1`：客户端由已移除的 Cordis `settingsScope` 迁移到 `configForms`。
- Host 端不再调用已删除的 `settings.installSection`，改为对 `hosts` 使用 Schemastery `.volatile()` / `.get()` 读取 live 配置。
- `peerDependencies` 中 `@deepseek-ai/dsh-settings` 与 `@deepseek-ai/dsh-web` 改为 `^0.1.7-rc.1`；`dsh.engines.dsh` 改为 `>=0.1.7-rc.1`。

### Fixed

- 修复插件卡在 `pending (waiting for service: settingsScope)`、无法激活的问题。

## [0.1.2] - 2026-09-20

### Changed

- 配置入口改为 Chat 主侧栏「插件 → 已安装」详情页（`plugins.bundle.config`），不再使用旧的 `settings.plugin.item` 卡片。
- 客户端 inject 调整为 `dsh-client-ui-plugin-manager` 等；`dsh.engines.dsh` 要求 `>=0.1.6-alpha.2`。
- 默认白名单置空，文档与测试改为仅使用保留示例域名，避免预置个人/组织主机名。

## [0.1.1] - 2026-09-20

### Changed

- 安装说明改为直接使用 GitHub 远程路径，无需先克隆仓库或从本地 `$PWD` 安装。

## [0.1.0] - 2026-09-20

### Added

- 将插件迁入本仓库：为经 Fake-IP / TUN（如 Surge / Clash `198.18.0.0/15`）解析的白名单域名提供原生 `web_fetch`，包装内置 `http` provider，不改变 `dsh-web.fetchProvider`。
