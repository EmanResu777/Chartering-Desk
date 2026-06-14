# P3 - Scaling & Production Readiness Plan

## 1. Current Architecture Limitations
- **In-process worker:** The current email sync worker runs asynchronously within the Express process.
- **Per-instance `syncLocks`:** The global `syncLocks` Map only guards duplicate syncs on a single instance.
- **Process-memory `jobResults`:** Temporary storage of sync job results exists only in the memory of the instance handling the request.
- **Restart data loss risk:** If the server restarts before the frontend polling loop retrieves `jobResults`, the completed sync results are lost.
- **Polling interval:** The current interval of 1000ms is too aggressive for production and should move to 2000–3000ms with exponential backoff before broad rollout.

## 2. Multi-Instance Risks
- **Duplicate syncs:** Because `syncLocks` is not shared across replicas, requests routed to different containers could trigger overlapping sync jobs.
- **Cross-replica polling risk:** If a user initiates a sync on Instance A and their polling request is routed to Instance B, Instance B will find the Firestore job document but not the `jobResults` in memory.
- **Shared persistence requirement:** Horizontal scaling cannot be safely enabled without shared locks and shared job/result persistence.

## 3. Recommended Future Production Architecture
- **External job queues:** `/api/email/sync` should enqueue work to an external broker (e.g., Google Cloud Tasks, Pub/Sub, BullMQ, or platform-native job queue).
- **Distributed locks:** Implement a per-user distributed lock (e.g., Redis/Upstash) to prevent duplicate sync loops.
- **Interim lock option:** A Firestore transaction-based lock may serve as a lightweight interim option if Redis is not yet available.
- **Safe database paths:** Persist safe parsed email records through the existing database path instead of holding them in memory.
- **Strict data privacy:** Job status tracking stays in Firestore, but raw email bodies, tokens, and passwords must **never** be stored in job docs, logs, or persistent sync tracking.

## 4. Container Replica Strategy
- **Single-instance MVP:** A single-instance deployment is acceptable for the current MVP phase.
- **Avoid broad scaling:** Do not scale backend container replicas broadly while the P3.1 worker relies on process memory.
- **Enabled state:** Multi-instance deployment should only be enabled after distributed state (locks, rate limits, queues) is fully implemented.
- **Orchestration:** `/api/healthz` and `/api/readyz` endpoints remain the primary mechanism for platform orchestration.

## 5. Rate Limit Scaling Plan
- **Local limitations:** Current rate limits operate individually on each backend instance.
- **Distributed persistence:** Before broad rollout, rate limit counters must be migrated to Redis/Upstash or a unified equivalent.
- **Scoping:** Rate limits must be strictly scoped by verified UID, route, source, and a rolling time window.

## 6. Usage Quotas & Plan Limits (P3.3 Preparedness)
Introduce structured tiers and usage counters when scaling, to enforce quotas:
- **Free/Basic Tier:** 20 Email Scans per day, 5 `parseEmail` calls per day.
- **Pro Tier:** 500 Email Scans per day, 50 `parseEmail` calls per day, enhanced Desk Network functionality.
- **Implementation Strategy:** Integrate `usage/{usageId}` inside Firestore to track incrementing values per user per month/day. Inject this authorization gate inside `server.ts` before allowing `parseEmail` or `fetchImapEmails` execution. Do NOT implement Stripe/Billing yet, just data tracking.

## 7. Backup / Data Export Plan
- Users should have an endpoint (`/api/export`) to safely extract their parsed Cargoes, Vessels, Drafts, and Settings in a clean JSON/CSV format.
- Stored Emails: Avoid bulk export of email credentials or raw bodies.
- Scheduled backups of the Firestore database should be configured via Google Cloud's Managed Export service.
