import { auth } from './firebase';

export interface Location {
  lat: number;
  lng: number;
}

export interface RoutingEstimate {
  routeDistanceNm: number | null;
  estimatedRouteDays: number | null;
  estimatedSpeedKnots: number;
  fromLocation: Location;
  toLocation: Location;
  provider: string;
  confidence: string;
  isEstimated: boolean;
  stale: boolean;
  routeCalculatedAt: string;
  sanitizedPreview: string;
  disclaimer: string;
}

export async function getRouteEstimate(params: {
  fromCoordinates?: any;
  toCoordinates?: any;
  vesselId?: string;
  cargoId?: string;
  dealRoomId?: string;
  speedKnots?: number;
}): Promise<RoutingEstimate | null> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null;

    const response = await fetch('/api/routing/estimate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.warn("Pricing/Routing provider failed to estimate route:", error);
    return null;
  }
}
