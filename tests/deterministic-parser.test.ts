// Offline deterministic-parser test harness for PILOT-BLOCKER-11B / PB14.
//
// Runs without a live server or Gemini key. Exercises the model-free parsing
// layer that guarantees broker circulars are split and structured correctly
// even when the AI under-performs.
//
//   npx tsx tests/deterministic-parser.test.ts

import {
  parseDeterministicCargoes,
  CargoCandidate,
} from '../src/lib/deterministicCargoParser';
import {
  parseDeterministicVessels,
  VesselCandidate,
} from '../src/lib/deterministicVesselParser';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function has(s: string | undefined, sub: string): boolean {
  return !!s && s.toLowerCase().includes(sub.toLowerCase());
}

// ---------------------------------------------------------------------------
const TWO_CARGO = `Saint Petersburg / Puerto Cabello
abt 5,519CBM g/c TOOLS EQUIPMENTS, construction and parts, civil.
25–31.03.2026
FIOS
5 PCT

Pasir Gudang / Rotterdam or Antwerp
8,000-10,000 mts coil u.w. 8 ton to 24 ton but majority 8-12 MT/coils, 3 tiers stackable
Load/ Discharge rate : CQD
19- 26th March 2026
Carrier shall advise and provide the coil loading sequence 3 days prior to actual direct loading.
5 pct`;

const BLOCK_1 = TWO_CARGO.split('\n\n')[0];
const BLOCK_2 = TWO_CARGO.split('\n\n')[1];

const SHORT_CARGO = `25,000 mt wheat
Constanta / Alexandria
Laycan 20-25 June
Freight 25 usd pmt
2.5 pct comm`;

const INCOMPLETE = `loading sequence 3 days prior to actual direct loading.
5 pct`;

// ---------------------------------------------------------------------------
console.log('\nTest A — exact two-cargo circular');
const a = parseDeterministicCargoes(TWO_CARGO);
check('A: 2 cargo candidates detected', a.length === 2, `got ${a.length}`);
if (a.length === 2) {
  const [c1, c2] = a;
  check('A/Cargo1 load = Saint Petersburg', has(c1.loadPort, 'saint petersburg'), c1.loadPort);
  check('A/Cargo1 discharge = Puerto Cabello', has(c1.dischargePort, 'puerto cabello'), c1.dischargePort);
  check('A/Cargo1 commodity has TOOLS', has(c1.commodity, 'tools'), c1.commodity);
  check('A/Cargo1 quantity has 5,519 CBM', has(c1.quantity, '5,519') && has(c1.quantity, 'cbm'), c1.quantity);
  check('A/Cargo1 laycan has 2026', has(c1.laycan, '2026'), c1.laycan);
  check('A/Cargo1 terms = FIOS', has(c1.terms, 'fios'), c1.terms);
  check('A/Cargo1 commission = 5 PCT', has(c1.commission, '5') && has(c1.commission, 'pct'), c1.commission);
  check('A/Cargo1 no garbage in ports', !has(c1.loadPort, 'cbm') && !has(c1.dischargePort, 'tools'), `${c1.loadPort} | ${c1.dischargePort}`);

  check('A/Cargo2 load = Pasir Gudang', has(c2.loadPort, 'pasir gudang'), c2.loadPort);
  check('A/Cargo2 discharge = Rotterdam or Antwerp', has(c2.dischargePort, 'rotterdam'), c2.dischargePort);
  check('A/Cargo2 commodity has coil', has(c2.commodity, 'coil'), c2.commodity);
  check('A/Cargo2 quantity has 8,000-10,000', has(c2.quantity, '8,000') && has(c2.quantity, '10,000'), c2.quantity);
  check('A/Cargo2 laycan has March', has(c2.laycan, 'march'), c2.laycan);
  check('A/Cargo2 terms = CQD', has(c2.terms, 'cqd'), c2.terms);
  check('A/Cargo2 commission = 5 pct', has(c2.commission, '5') && has(c2.commission, 'pct'), c2.commission);
  check('A/Cargo2 special note has Carrier shall', has(c2.special_requirements, 'carrier shall'), c2.special_requirements);
  check('A/Cargo2 no garbage in ports', !has(c2.loadPort, 'mts') && !has(c2.dischargePort, 'stackable'), `${c2.loadPort} | ${c2.dischargePort}`);
}

// --- PILOT-BLOCKER-13: 3-cargo circular (Houston / Vizag + the two above) ---
const THREE_CARGO = `Houston / Vizag
Ard 891.37 MT / 3,669.03 CBM  (+/- 5% chopt) Rig dismantled
1th – 7th March 2026
FLT Hook/hook
Non-Stackable, under deck only
Frt should inc. hooking/unhooking, wrip, awrip, thc, baf etc all surcharges, no waiting clause to be applicable
Vessel should be self-geared to load/discharge
5 pct

${TWO_CARGO}`;

// Mobile paste variant: blank lines collapsed to single newlines.
const THREE_CARGO_NOBLANK = THREE_CARGO.replace(/\n\s*\n/g, '\n');
const HOUSTON_BLOCK = THREE_CARGO.split('\n\n')[0];

console.log('\nTest PB13-A — 3-cargo circular (with blank lines)');
const t3 = parseDeterministicCargoes(THREE_CARGO);
check('PB13-A: 3 cargo candidates detected', t3.length === 3, `got ${t3.length}`);
if (t3.length === 3) {
  check('PB13-A/Cargo1 load = Houston', has(t3[0].loadPort, 'houston'), t3[0].loadPort);
  check('PB13-A/Cargo1 discharge = Vizag', has(t3[0].dischargePort, 'vizag'), t3[0].dischargePort);
  check('PB13-A/Cargo1 quantity has MT', has(t3[0].quantity, 'mt'), t3[0].quantity);
  check('PB13-A/Cargo1 no garbage port', !has(t3[0].loadPort, 'frt') && !has(t3[0].loadPort, 'hook'), `${t3[0].loadPort} | ${t3[0].dischargePort}`);
  check('PB13-A/Cargo2 load = Saint Petersburg', has(t3[1].loadPort, 'saint petersburg'), t3[1].loadPort);
  check('PB13-A/Cargo3 load = Pasir Gudang', has(t3[2].loadPort, 'pasir gudang'), t3[2].loadPort);
}

console.log('\nTest PB13-A2 — 3-cargo circular (mobile, blank lines stripped)');
const t3nb = parseDeterministicCargoes(THREE_CARGO_NOBLANK);
check('PB13-A2: 3 cargo candidates detected (no blank lines)', t3nb.length === 3, `got ${t3nb.length}`);
if (t3nb.length === 3) {
  check('PB13-A2/Cargo1 load = Houston', has(t3nb[0].loadPort, 'houston'), t3nb[0].loadPort);
  check('PB13-A2/Cargo2 load = Saint Petersburg', has(t3nb[1].loadPort, 'saint petersburg'), t3nb[1].loadPort);
  check('PB13-A2/Cargo3 load = Pasir Gudang', has(t3nb[2].loadPort, 'pasir gudang'), t3nb[2].loadPort);
}

console.log('\nTest PB13-C — Houston block only');
const hb = parseDeterministicCargoes(HOUSTON_BLOCK);
check('PB13-C: 1 cargo candidate', hb.length === 1, `got ${hb.length}`);
if (hb.length === 1) {
  check('PB13-C: load = Houston', has(hb[0].loadPort, 'houston'), hb[0].loadPort);
  check('PB13-C: discharge = Vizag', has(hb[0].dischargePort, 'vizag'), hb[0].dischargePort);
}

console.log('\nTest B — first block only');
const b = parseDeterministicCargoes(BLOCK_1);
check('B: 1 cargo candidate', b.length === 1, `got ${b.length}`);
if (b.length === 1) {
  check('B: load = Saint Petersburg', has(b[0].loadPort, 'saint petersburg'), b[0].loadPort);
  check('B: commodity has TOOLS', has(b[0].commodity, 'tools'), b[0].commodity);
}

console.log('\nTest C — second block only');
const c = parseDeterministicCargoes(BLOCK_2);
check('C: 1 cargo candidate', c.length === 1, `got ${c.length}`);
if (c.length === 1) {
  check('C: load = Pasir Gudang', has(c[0].loadPort, 'pasir gudang'), c[0].loadPort);
  check('C: commodity has coil', has(c[0].commodity, 'coil'), c[0].commodity);
}

console.log('\nTest D — short broker cargo');
const d = parseDeterministicCargoes(SHORT_CARGO);
check('D: 1 cargo candidate', d.length === 1, `got ${d.length}`);
if (d.length === 1) {
  check('D: commodity has wheat', has(d[0].commodity, 'wheat'), d[0].commodity);
  check('D: quantity has 25,000', has(d[0].quantity, '25,000'), d[0].quantity);
  check('D: load = Constanta', has(d[0].loadPort, 'constanta'), d[0].loadPort);
  check('D: discharge = Alexandria', has(d[0].dischargePort, 'alexandria'), d[0].dischargePort);
  check('D: laycan has June', has(d[0].laycan, 'june'), d[0].laycan);
  check('D: freight has usd', has(d[0].freight_idea, 'usd'), d[0].freight_idea);
  check('D: commission has pct', has(d[0].commission, 'pct'), d[0].commission);
  check('D: no missing core fields', (d[0].missing_fields || []).length === 0, JSON.stringify(d[0].missing_fields));
}

console.log('\nTest E — truly incomplete text');
const e = parseDeterministicCargoes(INCOMPLETE);
check('E: no cargo candidate (incomplete)', e.length === 0, `got ${e.length}`);

// ---------------------------------------------------------------------------
console.log('\nTest F — stability over bundled cargo samples');
let samples: any[] = [];
try {
  samples = JSON.parse(readFileSync(join(__dirname, 'cargo.json'), 'utf8'));
} catch {
  console.log('  (cargo.json not found, skipping)');
}
let fThrew = 0;
let fSingleRoute = 0;
let fRouteTotal = 0;
for (const s of samples) {
  const body: string = s?.payload?.email?.rawBody || '';
  if (!body) continue;
  try {
    const out = parseDeterministicCargoes(body);
    // Single-line comma-style circulars (the bulk of cargo.json) have no blank
    // lines / route-on-own-line, so deterministic returns []; that is fine —
    // the AI handles those. We only assert it never throws or fabricates
    // garbage ports.
    for (const cand of out) {
      if (cand.loadPort && /\b(cbm|mts|mt|tons)\b/i.test(cand.loadPort)) {
        throw new Error('garbage port: ' + cand.loadPort);
      }
    }
    if (out.length >= 1) fRouteTotal++;
    if (out.length === 1) fSingleRoute++;
  } catch (err: any) {
    fThrew++;
    failures.push(`F/sample ${s.id}: ${err.message}`);
  }
}
check('F: parser never throws / no garbage ports across samples', fThrew === 0, `${fThrew} failures`);
console.log(`  (samples=${samples.length}, produced candidates=${fRouteTotal}, single-cargo=${fSingleRoute})`);

// ---------------------------------------------------------------------------
// PILOT-BLOCKER-14: Deterministic vessel parser tests
// ---------------------------------------------------------------------------
const MV_SAADET = `MV SAADET
GENERAL CARGO SHIP / SINGLE DECKER / GEARLESS BOX LIKE
BUILT 2009 MALTA FLAG
DWT/DRFT: 12.200 MTS / 7.98 M
GRT/NRT: 7988 / 4126
LOA/BEAM/DM: 140.30 M / 20 M / 10.50 M
CARGO CAPACITY GRAIN/BALE: 522,188 CBFT
3 HOLDS / 3 HATCHES
PANDI LONDON PANDI, CLASS BV`;

console.log('\nTest G — MV SAADET vessel spec (PILOT-BLOCKER-14)');
const g = parseDeterministicVessels(MV_SAADET);
check('G: 1 vessel candidate', g.length === 1, `got ${g.length}`);
if (g.length === 1) {
  const vsl = g[0];
  check('G: name = MV SAADET', has(vsl.name, 'saadet'), vsl.name);
  check('G: built = 2009', vsl.built === '2009', vsl.built);
  check('G: flag = MALTA', has(vsl.flag, 'malta'), vsl.flag);
  check('G: dwt has 12,200', has(vsl.dwt, '12,200'), vsl.dwt);
  check('G: draft = 7.98 M', has(vsl.draft, '7.98'), vsl.draft);
  check('G: grt = 7988', has(vsl.grt, '7988'), vsl.grt);
  check('G: nrt = 4126', has(vsl.nrt, '4126'), vsl.nrt);
  check('G: loa has 140.30', has(vsl.loa, '140.30'), vsl.loa);
  check('G: beam has 20', has(vsl.beam, '20'), vsl.beam);
  check('G: capacity has 522,188', has(vsl.capacity, '522'), vsl.capacity);
  check('G: holds = 3', vsl.holds === '3', vsl.holds);
  check('G: hatches = 3', vsl.hatches === '3', vsl.hatches);
  check('G: gear = GEARLESS', has(vsl.gear, 'gearless'), vsl.gear);
  check('G: class = BV', has(vsl.class_society, 'bv'), vsl.class_society);
  check('G: pandi has LONDON', has(vsl.pandi, 'london'), vsl.pandi);
  check('G: type includes CARGO SHIP', has(vsl.type, 'cargo'), vsl.type);
  check('G: missing_fields has openPort', (vsl.missing_fields || []).includes('openPort'), JSON.stringify(vsl.missing_fields));
  check('G: missing_fields has openDate', (vsl.missing_fields || []).includes('openDate'), JSON.stringify(vsl.missing_fields));
  check('G: missing_fields does NOT have name', !(vsl.missing_fields || []).includes('name'), JSON.stringify(vsl.missing_fields));
  check('G: missing_fields does NOT have dwt', !(vsl.missing_fields || []).includes('dwt'), JSON.stringify(vsl.missing_fields));
}

console.log('\nTest G2 — incomplete vessel text returns empty array');
const g2 = parseDeterministicVessels('25 pct addcom\nfreight ideas welcome');
check('G2: no vessel candidate for non-vessel text', g2.length === 0, `got ${g2.length}`);

// ---------------------------------------------------------------------------
// PILOT-BLOCKER-15: response-shape / "meaningful candidate" gate.
// Mirrors the frontend rule that decides render-cards vs global-Incomplete-wall.
// A candidate is meaningful when it carries >= 1 real extracted field; only a
// total absence of meaningful candidates may show the global Incomplete wall.
// ---------------------------------------------------------------------------
const meaningfulCargo = (c: any) =>
  !!c && !!(c.commodity || c.raw_commodity || c.loadPort || c.dischargePort || c.quantity || c.laycan);
const meaningfulVessel = (v: any) =>
  !!v && !!(v.name || v.dwt || v.openPort || v.openDate || v.type || v.built || v.flag || v.grt || v.loa);

console.log('\nTest H — PB15 manual CARGO response shape (3-cargo early return)');
const h = parseDeterministicCargoes(THREE_CARGO);
check('H: deterministicCargoes = 3', h.length === 3, `got ${h.length}`);
check('H: every cargo is meaningful (renders, no wall)', h.every(meaningfulCargo), JSON.stringify(h.map(meaningfulCargo)));
check('H: at least one meaningful cargo (renderedCargoCandidates=true)', h.some(meaningfulCargo), 'none meaningful');

console.log('\nTest H2 — PB15 manual CARGO response shape (mobile, no blank lines)');
const h2 = parseDeterministicCargoes(THREE_CARGO_NOBLANK);
check('H2: deterministicCargoes = 3', h2.length === 3, `got ${h2.length}`);
check('H2: every cargo is meaningful', h2.every(meaningfulCargo), JSON.stringify(h2.map(meaningfulCargo)));

console.log('\nTest I — PB15 manual VESSEL response shape (MV SAADET early return)');
const i = parseDeterministicVessels(MV_SAADET);
check('I: deterministicVessels = 1', i.length === 1, `got ${i.length}`);
check('I: vessel is meaningful (renders, no wall)', i.length === 1 && meaningfulVessel(i[0]), JSON.stringify(i[0]));
check('I: renderedVesselCandidates would be true', i.some(meaningfulVessel), 'none meaningful');

console.log('\nTest J — PB15 truly-incomplete CARGO shows wall, never fake card');
const j = parseDeterministicCargoes(INCOMPLETE);
check('J: deterministicCargoes = 0', j.length === 0, `got ${j.length}`);
check('J: no meaningful cargo (global Incomplete wall is correct here)', !j.some(meaningfulCargo), 'unexpected meaningful');

// ---------------------------------------------------------------------------
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed === 0 ? 0 : 1);
