import { GeoLocation, haversineDistance, getProximityLabel as getBaseProximityLabel } from './locationIntelligence';
import { Vessel, Cargo } from './utils';

export interface ProximityInsight {
  vesselId: string;
  cargoId: string;
  distanceNm: number | null;
  proximityLabel: 'very close' | 'nearby' | 'regional' | 'far' | 'unknown';
  approachDays: number | null;
  laycanCompatibility: 'likely fits' | 'tight' | 'unlikely' | 'unknown';
  distanceConfidence: 'high' | 'medium' | 'low' | 'unknown';
  positionSourceConfidence: 'high' | 'medium' | 'low' | 'unknown';
  proximityScore: number;
  explanation: string;
  assumptions: string;
}

export function getAdvancedProximityLabel(distanceNM: number | null): 'very close' | 'nearby' | 'regional' | 'far' | 'unknown' {
  if (distanceNM == null) return 'unknown';
  if (distanceNM < 100) return 'very close';
  if (distanceNM < 500) return 'nearby';
  if (distanceNM < 2000) return 'regional';
  return 'far';
}

function parseLaycan(laycanStr?: string): { start: Date; end: Date } | null {
  if (!laycanStr) return null;
  // Naive parser for formats like "15-25 Oct 2024" or "15 Nov 2024" 
  // Should ideally be unified with existing date parsing logic.
  // For now, if we can't parse easily, return null.
  try {
    const parts = laycanStr.split('-');
    if (parts.length === 2) {
      const yearMatch = parts[1].match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
      const monthMatch = parts[1].match(/[a-zA-Z]+/);
      const month = monthMatch ? monthMatch[0] : '';
      
      const startDay = parseInt(parts[0], 10);
      const endDay = parseInt(parts[1], 10);
      
      if (!isNaN(startDay) && !isNaN(endDay) && month) {
         return {
           start: new Date(`${startDay} ${month} ${year}`),
           end: new Date(`${endDay} ${month} ${year}`)
         };
      }
    }
  } catch(e) {}
  return null;
}

function parseOpenDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.trim().toUpperCase();
  if (['TBD', 'TBA', 'UNKNOWN', 'N/A'].includes(normalized)) return null;
  if (['SPOT', 'PROMPT'].includes(normalized)) return new Date();
  try {
    // Basic string parse
    const rawMatch = dateStr.match(/\d+[\s-][a-zA-Z]+/);
    if (rawMatch) {
       // Append year if missing
       const d = new Date(`${rawMatch[0]} ${new Date().getFullYear()}`);
       if (!isNaN(d.getTime())) return d;
    }
    const standard = new Date(dateStr);
    if (!isNaN(standard.getTime())) return standard;
  } catch(e) {}
  return null;
}

export function calculateProximity(vessel: Partial<Vessel>, cargo: Partial<Cargo>, sourceModule?: string): ProximityInsight {
  const vLat = vessel.latitude ?? vessel.openingLocation?.latitude;
  const vLon = vessel.longitude ?? vessel.openingLocation?.longitude;
  
  const cLat = cargo.loadLocation?.latitude;
  const cLon = cargo.loadLocation?.longitude;

  let distanceNm: number | null = null;
  if (vLat != null && vLon != null && cLat != null && cLon != null) {
    distanceNm = haversineDistance(vLat, vLon, cLat, cLon);
  }

  const positionSource = String(vessel.positionSource || '').toLowerCase();
  const receivedAtMs = vessel.positionReceivedAt ? new Date(vessel.positionReceivedAt).getTime() : NaN;
  const hasFreshTimestamp = Number.isFinite(receivedAtMs) && (Date.now() - receivedAtMs) <= 2 * 60 * 60 * 1000;
  const isLiveAIS = positionSource.includes('ais') &&
    !positionSource.includes('stored') &&
    !vessel.aisStale &&
    vessel.latitude != null &&
    vessel.longitude != null &&
    hasFreshTimestamp;

  let distanceConfidence: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  let positionSourceConfidence: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
  
  if (distanceNm != null) {
     if (isLiveAIS) {
       distanceConfidence = 'high';
       positionSourceConfidence = 'high';
     } else if (vessel.openingLocation && vessel.openingLocation.latitude) {
       distanceConfidence = 'medium';
       positionSourceConfidence = 'medium';
     } else {
       distanceConfidence = 'low';
       positionSourceConfidence = 'low';
     }
  }

  const proximityLabel = getAdvancedProximityLabel(distanceNm);
  
  // Approach days - speed assumption 12 knots
  const ASSUMED_SPEED_KNOTS = 12;
  let approachDays: number | null = null;
  if (distanceNm != null) {
      // time in hours = distance / speed
      const hours = distanceNm / ASSUMED_SPEED_KNOTS;
      approachDays = hours / 24;
  }

  let laycanCompatibility: 'likely fits' | 'tight' | 'unlikely' | 'unknown' = 'unknown';
  const openDateObj = parseOpenDate(vessel.openDate);
  const laycanObj = parseLaycan(cargo.laycan);

  if (openDateObj && laycanObj && approachDays != null) {
      // Estimated arrival
      const estimatedArrival = new Date(openDateObj.getTime());
      estimatedArrival.setHours(estimatedArrival.getHours() + (approachDays * 24));
      
      const daysToLaycanStart = (laycanObj.start.getTime() - estimatedArrival.getTime()) / (1000 * 3600 * 24);
      const daysToLaycanEnd = (laycanObj.end.getTime() - estimatedArrival.getTime()) / (1000 * 3600 * 24);
      
      if (daysToLaycanEnd < 0) {
        laycanCompatibility = 'unlikely'; // arrives after canceling
      } else if (daysToLaycanStart >= 0) {
        laycanCompatibility = 'likely fits'; // arrives on or before laycan start
      } else {
        // Arrives during laycan
        if (daysToLaycanEnd <= 2) {
          laycanCompatibility = 'tight';
        } else {
          laycanCompatibility = 'likely fits';
        }
      }
  }

  // Score 0-100
  let score = 0;
  if (distanceNm != null) {
    if (distanceNm < 100) score += 50;
    else if (distanceNm < 500) score += 40;
    else if (distanceNm < 1500) score += 20;
    else score += 5;
  }
  
  if (laycanCompatibility === 'likely fits') score += 40;
  else if (laycanCompatibility === 'tight') score += 20;

  if (isLiveAIS) score += 10;
  else if (vLat != null) score += 5;

  const labels = [];
  if (distanceNm != null) labels.push(`${proximityLabel} (${distanceNm.toFixed(0)} NM)`);
  if (laycanCompatibility !== 'unknown') labels.push(`laycan ${laycanCompatibility}`);
  
  const explanation = labels.length > 0 
    ? `Proximity is ${labels.join(', ')}.` 
    : 'Insufficient data for proximity calculation.';

  const assumptions = distanceNm != null 
     ? `Straight-line distance calculation. ETA uses average speed of ${ASSUMED_SPEED_KNOTS} knots. AIS/proximity does not guarantee readiness.`
     : `No coordinate pair available to calculate distance.`;

  if (sourceModule && distanceNm != null) {
      logProximityAudit('proximity_calculated', {
         vesselId: vessel.id || '',
         cargoId: cargo.id || '',
         proximityLabel,
         proximityScore: score,
         distanceConfidence,
         positionSource: isLiveAIS ? 'live_ais' : (positionSource || 'unknown'),
         laycanCompatibility,
         sourceModule
      });
  }

  return {
    vesselId: vessel.id || '',
    cargoId: cargo.id || '',
    distanceNm,
    proximityLabel,
    approachDays,
    laycanCompatibility,
    distanceConfidence,
    positionSourceConfidence,
    proximityScore: score,
    explanation,
    assumptions
  };
}

let lastAuditTime = 0;
let lastAuditSignature = '';

export async function logProximityAudit(
  action: 'proximity_calculated' | 'proximity_viewed' | 'proximity_used_in_smart_radar' | 'proximity_used_in_ai_deal_brief' | 'proximity_used_in_negotiation_copilot' | 'proximity_access_denied' | 'proximity_estimate_assumption_mismatch',
  metadata: {
    vesselId?: string;
    cargoId?: string;
    dealRoomId?: string;
    proximityLabel?: string;
    proximityScore?: number;
    distanceConfidence?: string;
    positionSource?: string;
    laycanCompatibility?: string;
    reason?: string;
    sourceModule?: string;
  }
) {
  try {
    const { auth } = await import('./firebase');
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;

    // Simple de-duping to avoid spam loops
    const sig = `${action}-${metadata.vesselId}-${metadata.cargoId}-${metadata.sourceModule}`;
    const now = Date.now();
    if (sig === lastAuditSignature && (now - lastAuditTime) < 5000) {
       return; // drop duplicate if within 5 sec
    }
    lastAuditSignature = sig;
    lastAuditTime = now;

    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action, metadata })
    }).catch(e => console.error("Proximity audit failed:", e));
  } catch (err) {
     // ignore
  }
}
