# 账单与使用额度

## 核心机制
- **使用额度 (Usage Credits / credits):** 计费系统说明。
- **订阅计划:** 支持 Trial / Solo / Desk / Enterprise.
- **额度字段解释:** 
  - `creditsIncluded`: 包含的总额度。
  - `creditsUsed`: 已使用的额度。
  - `creditsRemaining`: 剩余的可用额度。
  - `resetAt`: 下一次额度重置日期。
- **402 CREDIT_LIMIT_EXCEEDED:** 当可用额度耗尽时，系统将阻挡新请求并返回 402 CREDIT_LIMIT_EXCEEDED (Payment Required)。
- **失败请求免扣费:** 失败的 AI 调用不会产生费用 (failed AI calls are not charged)。
- **扣除节点:** 只有在 AI 响应成功返回后才会扣除额度 (credits are deducted only after successful AI response)。
- **幂等性保障:** 扣费等操作保证幂等性，确保不会重复扣费 (idempotency / no double charge is explained)。

## Stripe 集成
- **Stripe Checkout:** 用于处理订阅升级的安全结账流程 (Stripe Checkout is explained)。
- **Billing Portal (账单门户):** 客户可借此管理订阅 (Billing Portal is explained)。
- **Stripe webhook 生命周期:** Stripe webhook lifecycle 生命周期全靠服务器端确保数据准确更新。
- **Stripe 密钥保护:** Stripe 密钥仅存储在服务端 (Stripe secrets are server-side only)。

## 管理员测试
- **Admin bypass:** 记录了管理员可用的 Admin bypass。
- **Test Grants:** 提供给用户的 test user grants，且 test grants do not fake paid subscription。
