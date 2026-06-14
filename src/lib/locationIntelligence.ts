export interface GeoLocation {
  portName?: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  positionSource?: 'manual' | 'parsed' | 'ais_placeholder' | 'unknown';
  positionUpdatedAt?: any;
  locationConfidence?: 'high' | 'medium' | 'low' | 'unknown';
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function getProximityLabel(distanceNM: number | undefined | null): string {
  if (distanceNM == null) return 'Unknown';
  if (distanceNM < 500) return 'Nearby';
  if (distanceNM < 2000) return 'Regional';
  return 'Far';
}
