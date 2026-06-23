---
name: pilot-blocker-13
description: >-
  Context and acceptance criteria for the active Chartering Desk pilot blocker
  PILOT-BLOCKER-13 (multi-cargo broker circular parsing in Cargo Draft -> Paste Text).
  Use when working on cargo paste parsing, the deterministic cargo parser,
  ManualIntakeMode, the /api/ai/parseEmail route, "Incomplete Result" / "N cargoes
  detected" behavior, or when asked to validate/close this blocker.
---

# PILOT-BLOCKER-13 — Multi-cargo broker circular parsing

**Status: NOT READY. PR #2 stays Draft. Pilot launch on HOLD.**

Branch: `claude/project-review-yh8ge1` · Current commit: `89b6188`

## What the blocker is

Cargo Draft → Paste Text must reliably turn pasted broker circulars
(email / WhatsApp / Telegram) into separate cargo candidates. Regressions caused
the real iPhone UI to show "Incomplete Result — all fields missing" with the full
pasted text dumped into "Useful Notes", even for clearly structured multi-cargo text.

## Code map

- `src/lib/deterministicCargoParser.ts` — model-free parser. Authoritative source
  of truth for route/quantity/commodity/laycan/terms/commission/notes. Supports
  N cargo blocks. Splits on blank lines first, then on route-header lines (mobile
  paste collapses blank lines), then single block.
- `server.ts` → `/api/ai/parseEmail` — calls `parseDeterministicCargoes(rawText)`.
  Deterministic result is AUTHORITATIVE: when it returns >= 1 cargo it is the base,
  the AI may only enrich EMPTY fields, and the incomplete fallback can never
  override it. `parserVersion` must be bumped when parser behavior changes (cache
  invalidation). Safe diagnostic log `[parseEmail][PB13]` prints counts only.
- `src/components/ManualIntakeMode.tsx` — reads `result.cargoes`. Renders one card
  per cargo, shows "N cargoes detected" when `multiCargoDetected`. The global
  Incomplete wall must only appear when there is exactly one empty cargo.
- Build marker `[PILOT-BLOCKER-13]` (frontend + backend `_diagnostic`) — must change
  on every behavioral build so the deployed build is verifiable in the UI.

## Invariants (do not break)

- N-cargo, never hardcode 2 (or 3). 3-cargo input → 3; 2-cargo → 2; 1 block → 1.
- Truly incomplete text (no route) → 0 deterministic candidates → incomplete warning.
- Deterministic fields are never overwritten by AI; AI fills gaps only.
- Notes come only from the current pasted input (no hallucinated/stale notes).
- No garbage ports: a "/" inside a commodity line ("g/c", "MT/coils") or a rate
  figure ("50k / 20k") is NOT a route.

## Test gate (run before claiming progress)

```
npx tsx tests/deterministic-parser.test.ts   # must be all-pass
npm run build
npx tsc --noEmit
```

Offline tests cover: exact 3-cargo (with and without blank lines), the 2-cargo
circular, single Houston/Vizag block, short wheat, truly-incomplete, and stability
over the 50 bundled `tests/cargo.json` samples.

## Acceptance criteria (to clear PILOT-BLOCKER-13)

Closure requires the REAL staging UI on a real iPhone, not offline tests alone:

1. UI build marker shows `[PILOT-BLOCKER-13]` (not 12-FIX).
2. The exact 3-cargo circular → "3 cargoes detected" + 3 separate cards.
3. The previous 2-cargo circular → "2 cargoes detected" + 2 separate cards.
4. No global Incomplete Result, no all-fields-missing wall, no full-text-in-Useful-
   Notes, no red Parse Error, no fake combined cargo, no stale/cached bad result.
5. Staging logs show `[parseEmail][PB13]` with deterministicCargoes/finalCargoes
   matching the cargo count and `multiCargoDetected:true` (counts only, no raw text).
6. `npm run build` + `npx tsc --noEmit` pass; QA suite run against staging.

Until ALL of the above are confirmed on-device, apply the
`chartering-desk-ready-gate` skill and report **NOT READY**.

## Environment note

Deploy + on-device test cannot run in the sandbox (no gcloud, no browser, no keys).
Hand off exact deploy/verify steps to the human/CI instead of fabricating results.
