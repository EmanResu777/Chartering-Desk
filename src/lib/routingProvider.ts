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

export async function estimateRoute(
  from: Location,
  to: Location,
  speedKnots: number = 12
): Promise<RoutingEstimate> {
  const timeoutMs = 3000;
  
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        routeDistanceNm: null,
        estimatedRouteDays: null,
        estimatedSpeedKnots: speedKnots,
        fromLocation: from,
        toLocation: to,
        provider: 'none',
        confidence: 'none',
        isEstimated: true,
        stale: false,
        routeCalculatedAt: new Date().toISOString(),
        sanitizedPreview: 'Routing unavailable (timeout)',
        disclaimer: 'Routing estimate timeout. Not valid for navigation.'
      });
    }, timeoutMs);

    setTimeout(() => {
      clearTimeout(timer);
      const providerKey = process.env.ROUTING_PROVIDER_API_KEY;
      
      const dLat = (to.lat - from.lat) * 60;
      const dLng = (to.lng - from.lng) * 60 * Math.cos((from.lat * Math.PI) / 180);
      const straightLineNm = Math.sqrt(dLat * dLat + dLng * dLng);
      
      if (!providerKey) {
        resolve({
          routeDistanceNm: straightLineNm,
          estimatedRouteDays: straightLineNm / (speedKnots * 24),
          estimatedSpeedKnots: speedKnots,
          fromLocation: from,
          toLocation: to,
          provider: 'straight_line_fallback',
          confidence: 'low',
          isEstimated: true,
          stale: false,
          routeCalculatedAt: new Date().toISOString(),
          sanitizedPreview: `Straight-line dist: ${Math.round(straightLineNm)} Nm`,
          disclaimer: 'Routing not configured. Falling back to approximate straight-line distance. Not valid for actual navigation.'
        });
        return;
      }

      // Real API Call to Searoutes API
      clearTimeout(timer);
      const SearoutesEndpoint = `https://api.searoutes.com/route/v2/sea/${from.lng},${from.lat};${to.lng},${to.lat}`;
      
      fetch(SearoutesEndpoint, {
        headers: {
          'x-api-key': providerKey,
          'accept': 'application/json'
        }
      })
      .then(res => {
         if (!res.ok) throw new Error(`Searoutes API error: ${res.status}`);
         return res.json();
      })
      .then(data => {
         // Assuming Searoutes returns distance in nautical miles or meters...
         // Let's assume features[0].properties.distance (in meters) and distance_nm (in Nm)
         // or we fallback to distance / 1852.
         
         const routeDistanceNm = data.features?.[0]?.properties?.distance ? (data.features[0].properties.distance / 1852) : (straightLineNm * 1.2);
         const estimatedRouteDays = routeDistanceNm / (speedKnots * 24);

         resolve({
            routeDistanceNm,
            estimatedRouteDays,
            estimatedSpeedKnots: speedKnots,
            fromLocation: from,
            toLocation: to,
            provider: 'searoutes_api',
            confidence: 'high',
            isEstimated: false,
            stale: false,
            routeCalculatedAt: new Date().toISOString(),
            sanitizedPreview: `Route Distance: ${Math.round(routeDistanceNm)} Nm (~${estimatedRouteDays.toFixed(1)} days @ ${speedKnots} kn)`,
            disclaimer: 'Powered by Searoutes API. Estimate for commercial reference only. Not valid for navigation. ETA is not guaranteed.'
         });
      })
      .catch(err => {
         // Fallback on error
         const routeDistanceNm = straightLineNm * 1.2;
         const estimatedRouteDays = routeDistanceNm / (speedKnots * 24);

         resolve({
            routeDistanceNm,
            estimatedRouteDays,
            estimatedSpeedKnots: speedKnots,
            fromLocation: from,
            toLocation: to,
            provider: 'simulated_sea_route_fallback',
            confidence: 'low_simulated',
            isEstimated: true,
            stale: false,
            routeCalculatedAt: new Date().toISOString(),
            sanitizedPreview: `Simulated Route: ${Math.round(routeDistanceNm)} Nm (~${estimatedRouteDays.toFixed(1)} days @ ${speedKnots} kn)`,
            disclaimer: 'This is a SIMULATED fallback route estimate due to provider error. Not valid for navigation or exact commercial calculation.'
         });
      });
    }, 50); 
  });
}
