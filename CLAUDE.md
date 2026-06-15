# Chartering Desk — Agent Guide (CLAUDE.md)

AI-powered chartering desk for shipbrokers: turns broker emails / pasted circulars
into structured cargo & vessel data, matching, deal rooms, and recaps.

- Frontend: React 19 + TypeScript + Vite + Tailwind (`src/`)
- Backend: Express + TypeScript monolith (`server.ts`), Firebase Admin / Firestore
- AI: Google Gemini (primary) + OpenAI (fallback); abstraction in `src/lib/aiRouter.ts`
- Deploy: Google Cloud Run (buildpacks: `npm run build` → `npm start`)

## Commands

```
npm run dev          # tsx server.ts (local dev)
npm run build        # vite build + esbuild server.ts -> dist/server.cjs
npm run start        # NODE_ENV=production node dist/server.cjs
npx tsc --noEmit     # typecheck (also: npm run lint)
npx tsx tests/deterministic-parser.test.ts   # offline cargo-parser tests
```

The QA suite `tests/run-qa-tests.cjs` needs a running server + `GEMINI_API_KEY`
and a staging/emulator Firestore — it is NOT runnable in an offline sandbox.

## Current state (read before acting)

- Active blocker: **PILOT-BLOCKER-13** (multi-cargo Paste Text parsing).
- Working branch: `claude/project-review-yh8ge1`.
- PR **#2** is intentionally **Draft** — do NOT merge.
- Status: **NOT READY**. Pilot launch on HOLD. Do NOT deploy production.

## Skills — apply these

Project skills live in `.claude/skills/`. Apply them proactively:

- **chartering-desk-ready-gate** — before ANY "READY"/done/merge/deploy claim.
  Forces build + typecheck + tests + real staging/mobile UI proof; blocks false
  positives; requires labeling evidence as ran / inspected / NOT TESTED.
- **pilot-blocker-13** — when touching cargo paste parsing, the deterministic
  parser, `ManualIntakeMode`, or `/api/ai/parseEmail`. Holds the invariants and
  on-device acceptance criteria.
- **safe-code-review** — before commit / PR; catches security, billing, auth,
  and Firestore regressions and scope creep.

## Non-negotiable safety boundaries

- Do not weaken `firestore.rules`.
- Do not bypass billing/credits; credit verification fails closed; no AI call
  before credit verification.
- Do not expose raw AI prompts/responses, provider payloads, or secrets; no
  secrets in `VITE_` vars.
- Firebase Admin uses Cloud Run runtime SA + IAM (ADC); `FIREBASE_SERVICE_ACCOUNT`
  JSON is optional fallback only — never mandatory.
- No auto-creating fixtures/charter parties; no auto-sending external email;
  do not bypass broker-side Recap confirmation.

## Honesty rule

Never report a check as passed unless it was actually executed here. If a check
cannot run in the current environment (no gcloud / browser / API keys), say
"NOT TESTED — <reason>" and hand off exact steps. Offline/unit results never
substitute for real staging/mobile UI validation.

## Key parser facts (PILOT-BLOCKER-13)

- `src/lib/deterministicCargoParser.ts` is authoritative for cargo fields; AI only
  enriches empty fields and must never erase deterministic data.
- Parser supports N cargo blocks; splits on blank lines, then route-header lines
  (mobile paste collapses blank lines), then single block.
- Bump `parserVersion` in `server.ts` whenever parser behavior changes (cache
  invalidation), and bump the `[PILOT-BLOCKER-*]` build marker so the deployed
  build is verifiable in the UI.
- Diagnostic log `[parseEmail][PB13]` prints counts only — never raw text.
