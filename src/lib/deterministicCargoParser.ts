// Deterministic broker-circular cargo parser.
//
// This module provides a model-free parsing layer for pasted broker circulars
// (email / WhatsApp / Telegram). It exists so that multi-cargo broker text is
// split and structured correctly even when the AI model under-performs, returns
// a single merged cargo, or fails entirely. The AI may still enrich the result,
// but this layer must never produce garbage (e.g. ports taken from a commodity
// line that merely happens to contain a "/").

export interface CargoCandidate {
  commodity?: string;
  raw_commodity?: string;
  quantity?: string;
  loadPort?: string;
  dischargePort?: string;
  laycan?: string;
  terms?: string;
  commission?: string;
  freight_idea?: string;
  special_requirements?: string;
  missing_fields: string[];
}

// A quantity is a number (optionally a range, optionally "abt"/"ard") followed
// by a recognised mass/volume unit. Requiring a digit before the unit avoids
// false positives from port names that merely contain the letters "mt"/"ton"
// (e.g. "Southampton"). Optionally captures a second "/ <n> <unit>" figure
// ("891.37 MT / 3,669.03 CBM") and a "(+/- 5% chopt)" tolerance.
const QTY_REGEX = /(?:(?:abt|ard|approx|about|ca)\.?\s*)?\d[\d.,]*(?:\s*[-–]\s*\d[\d.,]*)?\s*(?:cbm|mts|mt|tons|ton)\b(?:\s*\/\s*\d[\d.,]*\s*(?:cbm|mts|mt|tons|ton)\b)?(?:\s*\(\s*\+\/-\s*\d+\s*%[^)]*\))?/i;

// Month names (word-bounded) and a 202x year are strong laycan signals.
const MONTH_REGEX = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const YEAR_REGEX = /\b20[2-9]\d\b/;
// Bare numeric date range, used only as a weak fallback when no month/year line
// is present (e.g. "20-25").
const DATE_RANGE_REGEX = /\b\d{1,2}\s*(?:st|nd|rd|th)?\s*[-–/]\s*\d{1,2}\b/;

// Lines that look like a commission / freight / rate / commercial note. Used to
// keep these out of the laycan slot.
const COMMERCIAL_NOISE_REGEX = /(\bpct\b|%|comm\b|addcom|freight|usd|pmt|\bws\b|\$)/i;

// A "/" used as a load/discharge RATE separator ("50k / 20k", "12k/10k",
// "30k SHINC / 25k SHINC") rather than a load/discharge route. We must not
// mistake these rate figures for ports.
const RATE_SLASH_REGEX = /\d[\w.,]*\s*(?:[a-z]{2,6}\s*)?\/\s*\d/i;

function isRouteLine(line: string): boolean {
  if (!line.includes('/')) return false;
  const l = line.toLowerCase();
  // Exclude "load/discharge rate", FIOS/CQD term lines, etc.
  if (
    l.includes('load/discharge') ||
    l.includes('load / discharge') ||
    l.includes('load/ discharge') ||
    l.includes('rate') ||
    l.includes('cqd') ||
    l.includes('fios') ||
    l.includes('filo')
  ) {
    return false;
  }
  // A commodity/quantity line ("8,000-10,000 mts coil ... MT/coils",
  // "abt 5,519CBM g/c TOOLS...") often contains "/" but is NOT a route.
  if (QTY_REGEX.test(line)) return false;
  // A load/discharge rate figure ("50k / 20k") is not a route.
  if (RATE_SLASH_REGEX.test(line)) return false;
  return true;
}

// Tokens that disqualify a line from being treated as a cargo-block HEADER
// (a "Load / Discharge" route line that begins a new cargo).
const HEADER_DENYLIST = /(load\s*\/?\s*disch|discharge|\brate\b|\bcqd\b|\bfios\b|\bfilo\b|\bfiost\b|\bflt\b|hook|\bfrt\b|freight|vessel|stack|surcharge|clause|\bthc\b|\bbaf\b|wrip|geared|laycan|\bcomm\b|\bpct\b|usd|pmt|\bws\b)/i;

// A cargo-block HEADER is a route line whose two sides are short, alphabetic
// place names. Stricter than isRouteLine — used to split circulars into cargo
// blocks when blank lines are absent (e.g. mobile copy-paste collapses them).
function isRouteHeaderLine(line: string): boolean {
  if (!line.includes('/')) return false;
  if (QTY_REGEX.test(line)) return false;
  if (RATE_SLASH_REGEX.test(line)) return false;
  if (HEADER_DENYLIST.test(line)) return false;
  const idx = line.indexOf('/');
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx + 1).trim();
  if (!left || !right) return false;
  if (/\d/.test(left) || /\d/.test(right)) return false; // ports have no digits
  if (left.split(/\s+/).length > 4 || right.split(/\s+/).length > 5) return false;
  if (!/^[a-z .,'()&/-]+$/i.test(left) || !/^[a-z .,'()&/-]+$/i.test(right)) return false;
  return true;
}

function stripLaycanLabel(line: string): string {
  return line.replace(/^laycan[:\s]*/i, '').trim();
}

/**
 * Parse a single cargo block (one opportunity) into a structured candidate.
 * Deterministic and side-effect free.
 */
export function parseDeterministicCargoBlock(blockText: string): CargoCandidate {
  const lines = blockText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const consumed = new Set<number>();

  let loadPort = '';
  let dischargePort = '';
  let quantity = '';
  let commodity = '';
  let laycan = '';
  let terms = '';
  let commission = '';
  let freight_idea = '';
  const notes: string[] = [];

  // 1. Route line (take the FIRST genuine route line only).
  for (let i = 0; i < lines.length; i++) {
    if (isRouteLine(lines[i])) {
      const idx = lines[i].indexOf('/');
      const lp = lines[i].slice(0, idx).trim();
      const dp = lines[i].slice(idx + 1).trim();
      if (lp && dp) {
        loadPort = lp;
        dischargePort = dp;
        consumed.add(i);
        break;
      }
    }
  }

  // 2. Quantity + commodity line.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const lower = lines[i].toLowerCase();
    if (lower.includes('carrier shall') || lower.includes('rate')) continue;
    const m = lines[i].match(QTY_REGEX);
    if (!m) continue;
    quantity = m[0].trim();
    let rest = lines[i].replace(m[0], '').trim();
    rest = rest.replace(/^g\/c\s*/i, ''); // "general cargo" prefix
    rest = rest.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
    // Separate the core commodity from descriptive notes ("u.w. ...").
    const markerIdx = rest.search(/\bu\.?\s?w\.?\b/i);
    if (markerIdx > 0) {
      commodity = rest.slice(0, markerIdx).replace(/[,.\s-]+$/g, '').trim();
      const tail = rest.slice(markerIdx).trim();
      if (tail) notes.push(tail);
    } else {
      commodity = rest;
    }
    consumed.add(i);
    break;
  }

  // 3. Laycan. Prefer a line with a month name or 202x year; fall back to a
  //    bare numeric date range only on a non-commercial, non-consumed line.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    if (MONTH_REGEX.test(lines[i]) || YEAR_REGEX.test(lines[i])) {
      laycan = stripLaycanLabel(lines[i]);
      consumed.add(i);
      break;
    }
  }
  if (!laycan) {
    for (let i = 0; i < lines.length; i++) {
      if (consumed.has(i)) continue;
      if (COMMERCIAL_NOISE_REGEX.test(lines[i])) continue;
      if (DATE_RANGE_REGEX.test(lines[i])) {
        laycan = stripLaycanLabel(lines[i]);
        consumed.add(i);
        break;
      }
    }
  }

  // 4. Terms (FIOS / CQD / FILO / FIOST / FLT). Consume a dedicated terms line.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const l = lines[i].toLowerCase();
    let matched = false;
    let consume = false;
    if (/\bflt\b/.test(l)) { terms = lines[i]; matched = true; consume = true; }
    else if (l.includes('fiost')) { terms = 'FIOST'; matched = true; }
    else if (l.includes('fios')) { terms = 'FIOS'; matched = true; }
    else if (l.includes('filo')) { terms = 'FILO'; matched = true; }
    else if (l.includes('cqd')) { terms = terms ? terms : 'CQD'; matched = true; }
    // Consume the line only if it is essentially just the term / handling rate.
    if (matched && (consume || l.includes('rate') || l.replace(/[^a-z]/g, '').length <= 8)) {
      consumed.add(i);
    }
  }

  // 5. Commission.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const l = lines[i].toLowerCase();
    if ((l.includes('pct') || l.includes('%') || l.includes('addcom') || /\bcomm\b/.test(l)) && !l.includes('freight')) {
      commission = lines[i];
      consumed.add(i);
      break;
    }
  }

  // 6. Freight idea.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const l = lines[i].toLowerCase();
    if (l.includes('freight') || l.includes('usd') || l.includes('pmt') || l.includes('$')) {
      freight_idea = lines[i];
      consumed.add(i);
      break;
    }
  }

  // 7. Everything left over is a free-text note from the current input only.
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    notes.push(lines[i]);
  }

  const special_requirements = notes.join('. ').replace(/\.\.+/g, '.').trim();

  const candidate: CargoCandidate = { missing_fields: [] };
  if (commodity) {
    candidate.commodity = commodity;
    candidate.raw_commodity = commodity;
  }
  if (quantity) candidate.quantity = quantity;
  if (loadPort) candidate.loadPort = loadPort;
  if (dischargePort) candidate.dischargePort = dischargePort;
  if (laycan) candidate.laycan = laycan;
  if (terms) candidate.terms = terms;
  if (commission) candidate.commission = commission;
  if (freight_idea) candidate.freight_idea = freight_idea;
  if (special_requirements) candidate.special_requirements = special_requirements;

  // Per-candidate missing-field detection over the core commercial fields.
  const missing: string[] = [];
  if (!commodity) missing.push('commodity');
  if (!quantity) missing.push('quantity');
  if (!loadPort) missing.push('load port / area');
  if (!dischargePort) missing.push('discharge port / area');
  if (!laycan) missing.push('laycan');
  candidate.missing_fields = missing;

  return candidate;
}

/** Split raw pasted text into candidate blocks on blank lines. */
export function splitIntoBlocks(text: string): string[] {
  return text
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/** Heuristic: does this block describe a cargo opportunity? */
export function isCargoBlock(block: string): boolean {
  const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let hasRoute = false;
  let hasLaycanOrQty = false;
  for (const line of lines) {
    if (isRouteLine(line)) hasRoute = true;
    if (
      MONTH_REGEX.test(line) ||
      YEAR_REGEX.test(line) ||
      QTY_REGEX.test(line) ||
      DATE_RANGE_REGEX.test(line)
    ) {
      hasLaycanOrQty = true;
    }
  }
  return hasRoute && hasLaycanOrQty;
}

/**
 * Parse the full pasted text into 0..N cargo candidates. Supports any number of
 * cargo blocks. Robust to mobile copy-paste that collapses blank lines.
 *
 * Strategy 1 — blank-line separated blocks (clean desktop / email paste).
 * Strategy 2 — route-header splitting (mobile paste with single-newline gaps):
 *              each cargo begins at a "Load / Discharge" header line.
 * Strategy 3 — single block.
 * Otherwise → empty array (let the AI / incomplete-warning path handle it).
 */
export function parseDeterministicCargoes(text: string): CargoCandidate[] {
  if (!text || !text.trim()) return [];

  // Strategy 1: blank-line separated blocks.
  const blocks = splitIntoBlocks(text);
  if (blocks.length >= 2) {
    const cargoes: CargoCandidate[] = [];
    for (const block of blocks) {
      if (isCargoBlock(block)) cargoes.push(parseDeterministicCargoBlock(block));
    }
    if (cargoes.length >= 1) return cargoes;
  }

  // Strategy 2: header-line splitting (blank lines stripped). A new cargo
  // starts at each route header line; leading orphan lines attach to block 0.
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isRouteHeaderLine(lines[i])) headerIdx.push(i);
  }
  if (headerIdx.length >= 2) {
    const cargoes: CargoCandidate[] = [];
    for (let h = 0; h < headerIdx.length; h++) {
      const start = h === 0 ? 0 : headerIdx[h];
      const end = h + 1 < headerIdx.length ? headerIdx[h + 1] : lines.length;
      const block = lines.slice(start, end).join('\n');
      if (isCargoBlock(block)) cargoes.push(parseDeterministicCargoBlock(block));
    }
    if (cargoes.length >= 1) return cargoes;
  }

  // Strategy 3: single block.
  const only = blocks[0] || text.trim();
  if (isCargoBlock(only)) {
    return [parseDeterministicCargoBlock(only)];
  }
  return [];
}

/**
 * Backwards-compatible helper used by the parseEmail route as a multi-cargo
 * enforcer: returns the candidate array only when at least two cargo blocks are
 * detected, otherwise null.
 */
export function tryDeterministicSplitAndParse(text: string): CargoCandidate[] | null {
  const cargoes = parseDeterministicCargoes(text);
  if (cargoes.length >= 2) return cargoes;
  return null;
}
