# 安全与隐私

## 鉴权架构
- UID comes from verified Firebase token。
- Client-supplied UID is not trusted。

## 数据安全屏障
- Gmail tokens are protected。
- Raw email body is not stored in job docs。
- Raw AI prompts/responses are not stored in usage/audit docs。
- Stripe secrets are server-side only。
- Admin mode is server-side only。
- Firestore permissions are owner/participant scoped。

## 已知限制
- Known limitations are documented。
