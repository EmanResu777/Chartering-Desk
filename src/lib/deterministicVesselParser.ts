// Deterministic broker-circular vessel parser.
//
// Model-free extraction of vessel properties from pasted broker text (AIS
// circulars, position lists, WhatsApp/Telegram vessel descriptions).
// Mirrors the contract of deterministicCargoParser: AI may enrich EMPTY fields
// only; this layer's output is authoritative and must never be erased by an
// AI failure or quota error.
//
// Supported formats: MV / M.V. / SS / MS / MT prefixed names, European
// decimal DWT ("12.200 MTS"), GRT/NRT, LOA/BEAM/DM, HOLDS/HATCHES, P&I, class.

export interface VesselCandidate {
  name?: string;
  type?: string;
  built?: string;
  flag?: string;
  dwt?: string;
  draft?: string;
  grt?: string;
  nrt?: string;
  loa?: string;
  beam?: string;
  depth?: string;
  capacity?: string;
  holds?: string;
  hatches?: string;
  gear?: string;
  class_society?: string;
  pandi?: string;
  openPort?: string;
  openDate?: string;
  missing_fields: string[];
}

// European-style thousands separator: "12.200" → "12,200".
// Only converts a dot followed by exactly 3 digits (then end or non-digit).
function normalizeEuropeanNumber(s: string): string {
  return s.replace(/\.(\d{3})(?!\d)/g, ',$1');
}

export function parseDeterministicVessel(rawText: string): VesselCandidate | null {
  if (!rawText || !rawText.trim()) return null;

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const v: VesselCandidate = { missing_fields: [] };

  // 1. Vessel name — look for MV / M.V. / MS / SS / MT / MY prefix in first 5 lines.
  for (const line of lines.slice(0, 5)) {
    const m = line.match(/^(?:MV|M\.V\.|MS|SS|MT|MY|FV|TB|RV)[\s.]+(.+)/i);
    if (m) {
      v.name = 'MV ' + m[1].trim().toUpperCase();
      break;
    }
  }
  // Fallback: first line that is all-caps letters/spaces (≤ 30 chars) and not a spec line.
  if (!v.name && lines.length > 0) {
    const first = lines[0];
    if (
      /^[A-Z][A-Z\s\-\.]{2,30}$/.test(first) &&
      !/(?:CARGO|SHIP|BUILT|DWT|GRT|LOA|CAPACITY|HOLDS|CLASS|PANDI|OPEN|FLAG)/i.test(first)
    ) {
      v.name = first.trim();
    }
  }

  // 2. Vessel type — line describing the ship type (e.g. "GENERAL CARGO SHIP / SINGLE DECKER").
  for (const line of lines) {
    if (
      /(?:GENERAL CARGO SHIP|BULK.?CARRIER|CONTAINER|TANKER|TWEEN.?DECKER|SINGLE.?DECKER|BOX.?LIKE|BOX.?SHAPED|RO.?RO|MPP|OPEN.?HATCH)/i.test(line) &&
      !/DWT|GRT|LOA|CAPACITY|HOLDS/i.test(line)
    ) {
      v.type = line.trim();
      break;
    }
  }

  // 3. Built year.
  for (const line of lines) {
    const m = line.match(/BUILT\s+(\d{4})/i);
    if (m) { v.built = m[1]; break; }
  }

  // 4. Flag — "MALTA FLAG" or "FLAG: MALTA".
  for (const line of lines) {
    // "MALTA FLAG"
    const m1 = line.match(/\b([A-Z]+(?:\s+[A-Z]+)?)\s+FLAG\b/i);
    if (m1) { v.flag = m1[1].trim().toUpperCase(); break; }
    const m2 = line.match(/FLAG[:\s]+([A-Z]+(?:\s+[A-Z]+)?)/i);
    if (m2) { v.flag = m2[1].trim().toUpperCase(); break; }
  }

  // 5. DWT and draft — "DWT/DRFT: 12.200 MTS / 7.98 M" or "50,000 DWT".
  for (const line of lines) {
    const m = line.match(
      /DWT(?:\/DW?A?T|\/DRFT|\/DRAFT)?[:\s]*([\d.,]+)\s*(?:MTS?|T(?:ONNES?)?)?\s*(?:\/\s*([\d.,]+)\s*M)?/i
    );
    if (m && !v.dwt) {
      v.dwt = normalizeEuropeanNumber(m[1]) + ' MTS';
      if (m[2]) v.draft = m[2] + ' M';
      break;
    }
    // Alternate: "50,000 DWT"
    const m2 = line.match(/([\d,]+)\s*DWT/i);
    if (m2 && !v.dwt) {
      v.dwt = m2[1] + ' MTS';
      break;
    }
  }

  // 6. GRT / NRT — "GRT/NRT: 7988 / 4126".
  for (const line of lines) {
    const m = line.match(/GRT\/NRT[:\s]*([\d,]+)\s*\/\s*([\d,]+)/i);
    if (m) { v.grt = m[1]; v.nrt = m[2]; break; }
  }

  // 7. LOA / Beam / Depth — "LOA/BEAM/DM: 140.30 M / 20 M / 10.50 M".
  for (const line of lines) {
    const m = line.match(
      /LOA(?:\/BEAM(?:\/(?:DM|DEPTH|D))?)?[:\s]*([\d.]+)\s*M?\s*\/\s*([\d.]+)\s*M?(?:\s*\/\s*([\d.]+)\s*M?)?/i
    );
    if (m && !v.loa) {
      v.loa = m[1] + ' M';
      if (m[2]) v.beam = m[2] + ' M';
      if (m[3]) v.depth = m[3] + ' M';
      break;
    }
  }

  // 8. Cargo capacity — "CARGO CAPACITY GRAIN/BALE: 522,188 CBFT".
  for (const line of lines) {
    const m = line.match(
      /(?:CARGO\s+)?CAPACITY(?:\s+GRAIN\/BALE)?[:\s]*([\d,]+)\s*(CBFT|CBM|CU\.?FT\.?|M3)/i
    );
    if (m) { v.capacity = m[1] + ' ' + m[2].toUpperCase(); break; }
  }

  // 9. Holds / Hatches — "3 HOLDS / 3 HATCHES".
  for (const line of lines) {
    const m = line.match(/(\d+)\s*HOLDS?\s*\/\s*(\d+)\s*HATCHES?/i);
    if (m) { v.holds = m[1]; v.hatches = m[2]; break; }
  }

  // 10. Gear — crane specs or GEARLESS.
  for (const line of lines) {
    if (/GEARLESS/i.test(line) && !v.gear) {
      v.gear = 'GEARLESS';
    }
    const m = line.match(/(\d+\s*[Xx]\s*[\d.]+\s*(?:MT?|T)\s*(?:CRANES?|GRABS?|DERRICKS?))/i);
    if (m && !v.gear) { v.gear = m[1].trim(); }
  }

  // 11. Class society and P&I — "PANDI LONDON PANDI, CLASS BV".
  for (const line of lines) {
    const pandiClass = line.match(/PANDI\s+([^,\n]+?)(?:,\s*CLASS\s+([A-Z]{2,}))?$/i);
    if (pandiClass) {
      if (!v.pandi) v.pandi = pandiClass[1].trim();
      if (!v.class_society && pandiClass[2]) v.class_society = pandiClass[2].trim();
    }
    const classOnly = line.match(/\bCLASS\s+([A-Z]{2,})\b/i);
    if (classOnly && !v.class_society) v.class_society = classOnly[1].trim().toUpperCase();
  }

  // 12. Open port / open date (optional — position circulars only).
  for (const line of lines) {
    const m = line.match(
      /OPEN[:\s]+([A-Z][A-Z\s]{1,25}?)(?:\s+((?:\d{1,2}[-\/]\d{1,2}(?:[-\/]\d{2,4})?|\d{1,2}\s+[A-Z]{3,9}(?:\s+\d{4})?|[A-Z]{3,9}\s+\d{1,2}(?:-\d{1,2})?(?:\s+\d{4})?)))?\s*$/i
    );
    if (m && !v.openPort) {
      v.openPort = m[1].trim();
      if (m[2]) v.openDate = m[2].trim();
      break;
    }
  }

  // Must have at least a name or a DWT to be a recognizable vessel candidate.
  if (!v.name && !v.dwt) return null;

  // Core missing-field list (the four fields the vessel draft form requires).
  const missing: string[] = [];
  if (!v.name) missing.push('name');
  if (!v.dwt) missing.push('dwt');
  if (!v.openPort) missing.push('openPort');
  if (!v.openDate) missing.push('openDate');
  v.missing_fields = missing;

  return v;
}

/**
 * Parse raw text into 0 or 1 vessel candidates. Returns an array for API
 * consistency with parseDeterministicCargoes. Multi-vessel circulars are not
 * yet split; each distinct vessel should be pasted separately.
 */
export function parseDeterministicVessels(rawText: string): VesselCandidate[] {
  const candidate = parseDeterministicVessel(rawText);
  return candidate ? [candidate] : [];
}
