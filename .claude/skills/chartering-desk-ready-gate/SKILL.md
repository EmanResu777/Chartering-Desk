---
name: chartering-desk-ready-gate
description: >-
  Gate that MUST be applied before reporting READY, marking a task complete, merging,
  or advancing a pilot/release for the Chartering Desk project. Use whenever you are
  about to write "READY", "done", "ship it", "merge", "deploy", or claim a feature/fix
  works. Forces build + typecheck + tests + real staging/mobile UI proof and blocks
  false-positive completion reports.
---

# Chartering Desk — READY Gate

A "READY" claim is a commercial signal that a shipbroker can rely on the result.
Do not emit it casually. This gate exists because past reports said READY while the
real mobile UI still failed.

## Hard rule

NEVER write "READY" (or equivalent: "done and working", "ship it", "good to merge",
"pilot can launch") unless EVERY box below is literally true and you can cite the
evidence. If you cannot run a check in your environment, you MUST say
"NOT TESTED — <reason>" — never imply it passed.

## Mandatory checklist before any READY

1. **Build**: `npm run build` passed (paste the tail / exit code).
2. **Typecheck**: `npx tsc --noEmit` passed (0 errors).
3. **Tests**: relevant tests run and passed, e.g.
   `npx tsx tests/deterministic-parser.test.ts` (state pass/fail counts).
4. **Real UI proof**: the actual deployed staging UI was exercised on the real
   target (desktop AND mobile/iPhone) for the exact failing input, with a visible
   build marker confirming the new build is live, plus a screenshot/log line.
   Offline/unit evidence is NOT a substitute for the real UI.
5. **No regressions**: safety boundaries below are intact.

If any item is NOT TESTED in your environment (no gcloud, no browser, no API keys),
the status is **NOT READY** and you hand off the exact steps to the human/CI.

## Distinguish evidence levels (always label)

- `VERIFIED (ran it)` — you executed the command/flow and saw the result.
- `VERIFIED (code inspection)` — you read the code path but did not execute it.
- `NOT TESTED — <reason>` — could not run it here.

A READY requires `VERIFIED (ran it)` for build, typecheck, tests, AND real UI.

## Safety boundaries that must never silently regress

- Do NOT weaken Firestore rules.
- Do NOT bypass billing/credits; credit verification must fail closed.
- Do NOT call an AI provider before successful credit verification.
- Do NOT expose raw AI prompts/responses, provider payloads, or secrets.
- Do NOT add secrets to `VITE_` (frontend) variables.
- Do NOT auto-create fixtures or charter parties; do NOT auto-send external email.
- Do NOT bypass broker-side Recap confirmation.

## Deploy / merge guardrails

- Do NOT deploy production without explicit human approval.
- Do NOT merge a PR that is intentionally Draft / on HOLD.
- Staging first, `--no-traffic`, runtime service account + IAM (no mandatory
  FIREBASE_SERVICE_ACCOUNT JSON).

## Required output shape when asked "is it ready?"

Report each checklist item with its evidence level, then a single
`Final status: READY | NOT READY` and a `Recommended next action:`.
