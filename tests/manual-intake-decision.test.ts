// Manual-intake render-decision tests (PILOT-BLOCKER-16).
//
// These exercise the FRONTEND decision logic, not just the parser. They prove
// the Cargo/Vessel "Paste Text" modal renders candidates from the client-side
// deterministic parser even when the backend throws ("Load failed") or returns
// an empty/incomplete body — the exact real-iPhone failures Roman reported.
//
//   npx tsx tests/manual-intake-decision.test.ts

import { decideManualIntakeRenderState, computeManualIntakeActionState } from '../src/lib/manualIntakeDecision';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------------------------------------------------------------------------
const THREE_CARGO = `Houston / Vizag
Ard 891.37 MT / 3,669.03 CBM  (+/- 5% chopt) Rig dismantled
1th – 7th March 2026
FLT Hook/hook
Non-Stackable, under deck only
Frt should inc. hooking/unhooking, wrip, awrip, thc, baf etc all surcharges, no waiting clause to be applicable
Vessel should be self-geared to load/discharge
5 pct

Saint Petersburg / Puerto Cabello
abt 5,519CBM g/c TOOLS EQUIPMENTS, construction and parts, civil.
25–31.03.2026
FIOS
5 PCT

Pasir Gudang / Rotterdam or Antwerp
8,000-10,000 mts coil  u.w. 8 ton to 24 ton but majority 8-12 MT/coils , 3 tiers stackable
Load/ Discharge rate : CQD
19- 26th March 2026
Carrier shall advise and provide the coil loading sequence 3 days prior to actual direct loading.
5 pct`;

const MV_SAADET = `MV SAADET
GENERAL CARGO SHIP / SINGLE DECKER / GEARLESS BOX LIKE
BUILT 2009 MALTA FLAG
DWT/DRFT: 12.200 MTS / 7.98 M
GRT/NRT: 7988 / 4126
LOA/BEAM/DM: 140.30 M / 20 M / 10.50 M
CARGO CAPACITY GRAIN/BALE: 522,188 CBFT
3 HOLDS / 3 HATCHES
PANDI LONDON PANDI, CLASS BV`;

const LOAD_FAILED = new Error('Load failed'); // iOS Safari fetch TypeError
const INCOMPLETE_CARGO_BODY = { type: 'CARGO', cargoes: [{ missing_fields: ['commodity', 'quantity', 'loadPort', 'dischargePort'] }], vessels: [] };
const INCOMPLETE_VESSEL_BODY = { type: 'VESSEL', cargoes: [], vessels: [{ missing_fields: ['name', 'dwt', 'openPort', 'openDate'] }] };

// ---------------------------------------------------------------------------
console.log('\n1. Cargo — backend THROWS, local renders 3 cargo cards');
{
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: THREE_CARGO, backendResult: null, backendError: LOAD_FAILED, backendStarted: true });
  check('1: cargoes.length === 3', d.cargoes.length === 3, `got ${d.cargoes.length}`);
  check('1: renderedFrom = local-deterministic', d.renderedFrom === 'local-deterministic', d.renderedFrom);
  check('1: showIncompleteWall === false', d.showIncompleteWall === false);
  check('1: showParseError === false', d.showParseError === false);
  check('1: localFallbackUsed === true', d.debug.localFallbackUsed === true);
  check('1: backendRequestFailed === true', d.debug.backendRequestFailed === true);
  check('1: backendErrorType = network', d.debug.backendErrorType === 'network', String(d.debug.backendErrorType));
  check('1: multiCargoDetected === true', d.multiCargoDetected === true);
  check('1: enrichmentNote present', !!d.enrichmentNote);
}

console.log('\n2. Cargo — backend returns INCOMPLETE body, local renders 3');
{
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: THREE_CARGO, backendResult: INCOMPLETE_CARGO_BODY, backendError: null, backendStarted: true });
  check('2: cargoes.length === 3', d.cargoes.length === 3, `got ${d.cargoes.length}`);
  check('2: renderedFrom = local-deterministic', d.renderedFrom === 'local-deterministic', d.renderedFrom);
  check('2: showIncompleteWall === false', d.showIncompleteWall === false);
  check('2: showParseError === false', d.showParseError === false);
  check('2: backendCargoes filtered to 0 (not meaningful)', d.debug.backendCargoes === 0, String(d.debug.backendCargoes));
}

console.log('\n3. Vessel — backend THROWS "Load failed", local renders MV SAADET');
{
  const d = decideManualIntakeRenderState({ expectedType: 'VESSEL', text: MV_SAADET, backendResult: null, backendError: LOAD_FAILED, backendStarted: true });
  check('3: vessels.length === 1', d.vessels.length === 1, `got ${d.vessels.length}`);
  check('3: vessel name = MV SAADET', /saadet/i.test(d.vessels[0]?.name || ''), d.vessels[0]?.name);
  check('3: vessel dwt has 12,200', /12,200/.test(d.vessels[0]?.dwt || ''), d.vessels[0]?.dwt);
  check('3: renderedFrom = local-deterministic', d.renderedFrom === 'local-deterministic', d.renderedFrom);
  check('3: showParseError === false (suppressed)', d.showParseError === false);
  check('3: showIncompleteWall === false', d.showIncompleteWall === false);
  check('3: localDeterministicVessels === 1', d.debug.localDeterministicVessels === 1);
}

console.log('\n4. Vessel — backend returns INCOMPLETE body, local renders MV SAADET');
{
  const d = decideManualIntakeRenderState({ expectedType: 'VESSEL', text: MV_SAADET, backendResult: INCOMPLETE_VESSEL_BODY, backendError: null, backendStarted: true });
  check('4: vessels.length === 1', d.vessels.length === 1, `got ${d.vessels.length}`);
  check('4: renderedFrom = local-deterministic', d.renderedFrom === 'local-deterministic', d.renderedFrom);
  check('4: showIncompleteWall === false', d.showIncompleteWall === false);
  check('4: showParseError === false', d.showParseError === false);
}

console.log('\n5. Parse Error ONLY when backend fails AND local found nothing');
{
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: 'hello there, any news?', backendResult: null, backendError: LOAD_FAILED, backendStarted: true });
  check('5: cargoes.length === 0', d.cargoes.length === 0, `got ${d.cargoes.length}`);
  check('5: showParseError === true', d.showParseError === true);
  check('5: showIncompleteWall === false', d.showIncompleteWall === false);
  check('5: renderedFrom = none', d.renderedFrom === 'none', d.renderedFrom);
}

console.log('\n6. Incomplete wall ONLY when local AND backend both found nothing');
{
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: 'hello there, any news?', backendResult: { type: 'OTHER', cargoes: [], vessels: [] }, backendError: null, backendStarted: true });
  check('6: cargoes.length === 0', d.cargoes.length === 0, `got ${d.cargoes.length}`);
  check('6: showIncompleteWall === true', d.showIncompleteWall === true);
  check('6: showParseError === false', d.showParseError === false);
}

console.log('\n7. Cargo — backend SUCCEEDS with meaningful cargoes (merged enrich)');
{
  const backend = { type: 'CARGO_LIST', cargoes: [
    { loadPort: 'Houston', dischargePort: 'Vizag', commodity: 'rig parts', freight_idea: 'USD 120 pmt' }, {}, {}
  ], vessels: [] };
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: THREE_CARGO, backendResult: backend, backendError: null, backendStarted: true });
  check('7: cargoes.length === 3', d.cargoes.length === 3, `got ${d.cargoes.length}`);
  check('7: renderedFrom = merged', d.renderedFrom === 'merged', d.renderedFrom);
  check('7: local data preserved (cargo1 loadPort Houston)', /houston/i.test(d.cargoes[0]?.loadPort || ''), d.cargoes[0]?.loadPort);
  check('7: backend enrichment applied (cargo1 freight_idea)', /120/.test(d.cargoes[0]?.freight_idea || ''), d.cargoes[0]?.freight_idea);
  check('7: enrichmentNote null (backend contributed)', d.enrichmentNote === null);
}

console.log('\n8. Security — debug carries no raw pasted text');
{
  const d = decideManualIntakeRenderState({ expectedType: 'CARGO', text: THREE_CARGO, backendResult: null, backendError: LOAD_FAILED, backendStarted: true });
  const dbg = JSON.stringify(d.debug);
  check('8: debug has no "Houston" raw text', !dbg.includes('Houston'));
  check('8: debug has no "Pasir" raw text', !dbg.includes('Pasir'));
  check('8: debug fields are counts/flags only', typeof d.debug.localDeterministicCargoes === 'number');
}

// ---------------------------------------------------------------------------
// PILOT-BLOCKER-18: publish-action availability (scroll-independent).
console.log('\n9. Action state — result with all items selected: publish without scroll');
{
  const a = computeManualIntakeActionState({ hasResult: true, selectedCargoCount: 3, selectedVesselCount: 0, isPublishing: false });
  check('9: selectedCount === 3', a.selectedCount === 3, String(a.selectedCount));
  check('9: canPublish === true', a.canPublish === true);
  check('9: mobileActionBarVisible === true', a.mobileActionBarVisible === true);
  check('9: topPublishButtonVisible === true', a.topPublishButtonVisible === true);
  check('9: publishButtonFixedOrSticky === true', a.publishButtonFixedOrSticky === true);
}

console.log('\n10. Action state — vessel result, one selected');
{
  const a = computeManualIntakeActionState({ hasResult: true, selectedCargoCount: 0, selectedVesselCount: 1, isPublishing: false });
  check('10: selectedCount === 1', a.selectedCount === 1, String(a.selectedCount));
  check('10: canPublish === true', a.canPublish === true);
  check('10: topPublishButtonVisible === true', a.topPublishButtonVisible === true);
}

console.log('\n11. Action state — nothing selected: buttons visible but disabled');
{
  const a = computeManualIntakeActionState({ hasResult: true, selectedCargoCount: 0, selectedVesselCount: 0, isPublishing: false });
  check('11: selectedCount === 0', a.selectedCount === 0);
  check('11: canPublish === false', a.canPublish === false);
  check('11: mobileActionBarVisible still true', a.mobileActionBarVisible === true);
  check('11: topPublishButtonVisible still true', a.topPublishButtonVisible === true);
}

console.log('\n12. Action state — publishing in progress: cannot re-publish');
{
  const a = computeManualIntakeActionState({ hasResult: true, selectedCargoCount: 3, selectedVesselCount: 0, isPublishing: true });
  check('12: canPublish === false while publishing', a.canPublish === false);
}

console.log('\n13. Action state — no result yet: no action controls');
{
  const a = computeManualIntakeActionState({ hasResult: false, selectedCargoCount: 0, selectedVesselCount: 0, isPublishing: false });
  check('13: mobileActionBarVisible === false', a.mobileActionBarVisible === false);
  check('13: topPublishButtonVisible === false', a.topPublishButtonVisible === false);
  check('13: canPublish === false', a.canPublish === false);
}

console.log('\n14. Action state — mixed cargo + vessel selection counts add up');
{
  const a = computeManualIntakeActionState({ hasResult: true, selectedCargoCount: 2, selectedVesselCount: 1, isPublishing: false });
  check('14: selectedCount === 3', a.selectedCount === 3, String(a.selectedCount));
  check('14: canPublish === true', a.canPublish === true);
}

// ---------------------------------------------------------------------------
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed === 0 ? 0 : 1);
