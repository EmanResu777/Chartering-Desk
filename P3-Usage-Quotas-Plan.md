# P3 - Usage Quotas and Plan Limits Plan

## 1. Purpose
Usage quotas are planned for future implementation to ensure cost control, prevent abuse, ensure fair usage across the platform, and provide a clear separation between free/trial tiers and paid plans.

## 2. Future Quota Categories
To effectively monitor and bill, the following quota categories must be defined:
- `emailsScanned:perDay`
- `parseEmail:perDay` (AI Parsing)
- `matchVessels:perDay`
- `aisLookups:perDay`
- `deskNetworkInvites:perDay`
- `recapGenerations:perDay`
- `draftStorage:totalCount`
- `sharedItems:totalCount`
- `manualTextIntake:perDay`
- `notificationEvents:perDay`
- `emailSyncJobs:perDay`
- `failedSyncAttempts:perDay`

## 3. Suggested Quota Scopes
Quotas should be aggregated and scoped across specific boundaries:
- **Primary:** Verified Firebase UID (e.g., limits per user identity mapped from a verified ID token).
- **Secondary (Future):** Organization / Team / `deskId` for team-based pooling plans.
- **Route / Action:** Action-specific rate limits and quotas (e.g., `parseEmail` vs `syncImap`).
- **Source Type:** Granular limits by source (`gmail`, `imap`, `manual`, `deskNetwork`, `ai`).
- **Time Window:** Rolling window (e.g., last 24h) or absolute Calendar Day limits.
- **Plan Type:** `planId` associated with the UID or Desk.

## 4. Suggested Future Quota Data Model
**Data Paths (Planned Structure):**
- `users/{uid}/usage/{yyyyMMdd}`
- `users/{uid}/quotaEvents/{eventId}`
- `desks/{deskId}/usage/{yyyyMMdd}` (Future team mapping)

**Fields Configuration:**
```typescript
interface UsageQuotaEvent {
  uid: string;                 // Extracted exclusively from verified token
  deskId?: string;             // Optional mapping for team plans
  planId: string;              // Current plan ID of the user/desk
  action: string;              // e.g., 'parseEmail'
  source: string;              // e.g., 'gmail', 'manual'
  count: number;               // Operation cost / count
  windowStart: Timestamp;
  windowEnd: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  safeErrorCode?: string;      // Recorded if the operation hit a quota or failed
}
```
**Data Privacy & Safety:**
- **DO NOT STORE**: Raw email bodies, Gmail OAuth tokens, refresh tokens, passwords, full private payload content, or raw AI prompts/responses. Only safe, anonymous volume metrics are permitted here.

## 5. Suggested Future Plan Tiers
*Note: Indicative categories only. No billing or enforcement code is implemented yet.*
- **Trial:** Minimal limits (e.g., 20 `parseEmail`/day, 1 `emailSync`/day) for sandbox testing.
- **Solo Broker:** Individual limits for high email volume but standard AI parsing.
- **Pro Desk:** Increased `aisLookups`, priority AI queuing, larger draft storage.
- **Team:** Pooled usage quotas tied to a `deskId`.
- **Enterprise / Custom:** Unlimited/custom quota mappings with dedicated throughput.

## 6. Enforcement Strategy for Future Phase
When implementation begins, enforcement must adhere to this flow:
1. Verify Firebase ID token explicitly on the backend endpoint.
2. Derive the `UID` **only** from the verified token, never from client-supplied body payloads.
3. Check the user's quota balance before initiating any expensive operation.
4. Increment usage metrics atomically (e.g., using `FieldValue.increment` or distributed Redis counters) subsequent to the accepted operation or upon completion.
5. Return a safe, standard `429 Too Many Requests` or Payment Required error if exceeded.
6. Guard against leaking private usage volumes or metrics across users via tight Firestore Security Rules.
7. Log only safe usage metrics, keeping process RAM and standard output clean of PII.

## 7. Cost-Control Notes
The following actions represent the highest capital/computational cost and require stringent limits:
- Email scanning & large inbox syncs (IMAP memory overhead and network egress).
- AI parsing & chunking (Large token ingestion costs).
- Vessel matching & AIS lookups (External API cost per hit).
- Recap generation (High output-token generation costs).
- Repeated failed sync attempts (Wasted compute loops).

## 8. Abuse & Risk Cases
Anti-abuse protections must be applied against the following vectors:
- **Repeated sync spam:** Users mashing "Sync Now" initiating multiple background queue processes.
- **Repeated AI parse spam:** Malicious loop calling `/api/parse`.
- **Concurrency bypass:** Multiple browser tabs triggering the identical sync function simultaneously to bypass sequential single-instance locks.
- **Client spoofing:** Maliciously supplying another user's UID in the request body to drain their quota.
- **Distributed counting bypass:** Taking advantage of per-instance memory rate limits by load-balancing requests rapidly across multiple isolated containers.
- **Team sharing abuse:** Dozens of users sharing a single account to bypass "Solo Broker" quotas.

## 9. Future Distributed Quota Storage
To combat abuse effectively at scale and correctly enforce quotas:
- Move from per-instance memory counters to an out-of-process cache tool like Redis/Upstash for fast, unified counting across instances.
- Maintain Firestore aggregate base usage documents as a persistent ledger for the billing trail.
- Require atomic increments/transactions to prevent race conditions during counting.
- Enforce **idempotency keys** attached to API requests to negate double-counting on network retries.
- Safely cache the user's `planLimits` near the application edge with a short TTL to save database reads on every single request.
