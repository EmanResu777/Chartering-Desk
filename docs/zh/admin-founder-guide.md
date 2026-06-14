# 管理员/创始人指南

## 权限配置
只有在服务器端指定的 `ADMIN_UIDS` 或 `ADMIN_EMAILS` 能启用管理员模式。
- **服务端管理员模式:** 管理员模式仅限于服务器端 (Admin mode is server-side only)。
- **Admin bypass (管理员额度绕过):** 允许管理员安全地绕过计费限制 (admin bypass is documented safely)。

## 平台工具
- **测试用户授权 (Test user grants):** 授予特定账号测试使用额度 (test user grants are documented correctly)。测试授权不会伪造 Stripe 付费订阅状态 (test grants do not fake paid subscription)。
