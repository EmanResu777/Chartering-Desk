---
name: safe-code-review
description: >-
  Safety-focused review checklist for any change to the Chartering Desk backend
  (server.ts), AI parser layer, billing/credits, auth, or Firestore. Use before
  committing, before opening/updating a PR, or when reviewing a diff, to catch
  security/billing/safety regressions and accidental scope creep.
---

# Chartering Desk — Safe Code Review

Run this against the current diff (`git diff` / `git diff --staged`) before commit
or PR. Goal: ship the intended fix without weakening safety, billing, or auth.

## Scope discipline

- Change only what the task requires. Flag any unrelated edits.
- No new runtime dependencies and no external packages unless explicitly approved.
- Config/agent-workflow changes (`.claude/`, `CLAUDE.md`) are not application logic.

## Security & secrets

- No secret values in code, logs, comments, commit messages, or PR text.
- No secrets in `VITE_` (these ship to the browser).
- No raw AI prompts/responses, provider payloads, tokens, or PII in logs.
  Diagnostic logging is counts/booleans only.
- Firebase Admin must keep working via Cloud Run runtime SA + IAM
  (Application Default Credentials). `FIREBASE_SERVICE_ACCOUNT` JSON stays an
  OPTIONAL fallback — never make it mandatory.

## Firestore rules

- Do not weaken `firestore.rules`. Owner/participant checks must stay intact.
- A change touching `firestore.rules` requires explicit justification in the PR.

## Billing / credits

- Credit verification must FAIL CLOSED (block on missing config, null doc, or any
  exception).
- No AI provider call before a successful credit check.
- Do not change credit costs, plan limits, or charging order incidentally.
- Failed AI calls must not be charged; idempotency for high-value ops preserved.

## Auth

- All sensitive `/api/ai/*` endpoints verify the Firebase ID token server-side.
- `routeTask` and admin paths stay protected. No client-trusted UID for decisions.

## Chartering safety boundaries

- No automatic fixture or charter party creation.
- No automatic external email sending.
- Broker-side Recap confirmation is not bypassed.

## Build / verify before commit

```
npx tsc --noEmit
npm run build
npx tsx tests/deterministic-parser.test.ts   # if parser touched
```

## PR hygiene

- A Draft / on-HOLD PR stays Draft. Do not merge without explicit approval.
- Do not deploy production. Staging first, `--no-traffic`.
- PR body: state what changed, evidence levels (ran vs inspected vs not tested),
  and what is still pending. Never claim READY here (see `chartering-desk-ready-gate`).

## Output

List findings grouped as: Blockers / Should-fix / Notes. If clean, say so and cite
the build/typecheck/test evidence.
