# BASELINE LOCK: P0–P3

## Accepted Checkpoints

The following milestones and architectures have been accepted and locked as the stable baseline functioning state for the application:
- Pre-Launch Security Rate Limit Token Hardening Working State — PASSED
- Backend AI Queue Retry Cache Resilience Working State — PASSED
- Hybrid AI Provider Timeout Retry Structured Output Resilience Working State — PASSED
- P2 Observability / Diagnostics / Audit / Health Working State — PASSED
- Onboarding PublicProfiles Desk Discovery Permission Stable State — PASSED
- P3.1 Background Email Sync Worker — PASSED
- P3.2 Distributed Readiness Planning — PASSED
- P3.3 Usage Quotas / Plan Limits Planning — PASSED

## Release Candidate State
This baseline code encapsulates all necessary features for a single-instance MVP deployment.
The following core flows are implemented, functioning, and stable:
- Firebase Auth Login / Broker ID Generation.
- OAuth Integration and secure Token Refresh handling.
- Background polling and asynchronous email synchronization via `jobId`.
- AI schema execution: `parseEmail`, `matchVessels`, Recap Generators.
- Full Manual Text Intake & Draft manipulation workflows.
- Desk Network searching, invite logic, and connection state.

## Known Limitations (Non-Blocking)
The release candidate currently carries the following known technical debt and boundaries which will be expanded via infrastructure, not application code changes:
- Current email sync worker operates asynchronously but remains strictly in-process.
- `syncLocks` rate limiting guards are per-instance only.
- `jobResults` temporary sync storage exists in process-memory only.
- Scaling out (multi-instance/replicas) requires distributed locks and distributed job result persistence (e.g., Redis, external Job Queue).
- Quota enforcement structures are planned and documented but are not actively returning 429 errors based on limits.
- Billing is planned but not currently implemented.
