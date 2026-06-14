# 紧急交易与机会

## My Shared Cargo / My Shared Tonnage
在此处管理货盘与运力。

## 标记为紧急 (Mark Urgent)
您可点击操作以 Mark Urgent。
操作中包含 `urgentReason`, `urgentUntil` 和 `urgentType`。
留下完整的审计追踪 (audit trail)。

## 紧急机会 (Hot Opps)
系统匹配的紧急热点机会 (Hot Opps)。

## 交互流程
- 提供 **Interest (感兴趣)** / **Contact (联系)** / **Dismiss (驳回)** 操作。
- 状态可变为 `negotiating`，然后变为 `ready_for_approval`。
- **Cargo side approval** 与 **Vessel side approval** 任一方可确认。
- 达到 `dual_approved` 状态 (双方经纪确认 / dual approval)。

## 生成草稿与确认
- 可以生成 Recap Draft。
- 接着进行 平台内经纪方 Recap 确认 (Broker-side Recap Confirmation)。

## 其他保护
- **防止重复:** Duplicate prevention 防止误触。
- **过期与取消:** Expiry/cancellation 自动处理超期事项。
