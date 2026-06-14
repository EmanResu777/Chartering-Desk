// Offline deterministic-parser test harness for PILOT-BLOCKER-11B.
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
console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log('Failures:');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(failed === 0 ? 0 : 1);
