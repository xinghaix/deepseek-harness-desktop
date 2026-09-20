# 桌面 Release 更新验签公钥（固定，禁止二次更改）

## 作用范围

`release-public-key.hex` 是 `xinghaix/deepseek-harness-desktop` 的固定 Ed25519 发布公钥，仅供桌面更新器验证 Release manifest 的发布者签名。应用身份为 `com.deepseek.harness.desktop`，适用于本地打包和正式发布的 macOS、Windows、Linux 桌面端。经验证的 manifest 绑定版本、通道、平台、制品名称、大小与 SHA-256；公钥本身不是 GitHub 仓库权限或 URL 白名单。

它不用于 DSH CLI 更新、插件签名、模型 API 凭据、用户登录、桌面 bridge 认证、TLS 或操作系统代码签名/公证；不授权执行任意远程代码。它是公开验证材料，不是签名私钥。

## 固定身份与禁止事项

```text
8c2659313bfe0ea8e05610ddcd88ba666697bec00ec3eb3eb669513fabe8c24f
```

**保持该公钥原值，禁止二次更改、替换、重新生成、删除或复用于其他安全用途。禁止为了通过构建而修改固定值保护、删除验签或恢复覆盖入口。** 对应私钥只用于发布基础设施，不得进入源码或客户端。发生私钥泄露、丢失或签名不匹配时，停止发布并报告维护者，不得擅自换钥。

## 构建约束与边界

- `make build` / `scripts/build.sh` 必须读取此文件，并与脚本固定身份逐字匹配后注入二进制；缺失、损坏或替换为其他合法公钥均拒绝构建。
- GitHub 的 `DSH_UPDATE_MANIFEST_PUBLIC_KEY` 仅用于一致性核对：未设置或空值使用仓库公钥；非空值必须完全相同，不能覆盖它。
- 已注入公钥的应用不接受运行时 `DSH_DESKTOP_UPDATE_PUBLIC_KEY` 替换。
- 直接 `go build` 不经过上述打包保护，也不自动注入公钥；可分发的本地包必须使用标准打包入口。
- 这些约束保护正常开发和构建流程，不能抵御拥有源码写权限者同时恶意改掉公钥与保护代码；仓库权限、代码审查和分支保护仍需独立保障。

验证：`python3 scripts/build-update-key_test.py`、`go test ./internal/update`。构建测试覆盖三端参数注入与拒绝替换，不代表三端原生更新安装 E2E 验收。
