// Server-side AIS provider. Never imported by browser code.

export interface SafeAISResponse {
  vesselId: string;
  imo?: string;
  mmsi?: string;
  latitude: number | null;
  longitude: number | null;
  course: number | null;
  speed: number | null;
  heading: number | null;
  navigationStatus: string | null;
  destination: string | null;
  eta: string | null;
  positionReceivedAt: string | null;
  provider: string;
  confidence: "high" | "medium" | "low" | "none";
  isLive: boolean;
  stale: boolean;
  sanitizedPreview: string;
}

const aisCache = new Map<string, SafeAISResponse & { fetchedAt: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const STALE_POSITION_MS = 2 * 60 * 60 * 1000;

export interface AISLookupReq {
  vesselId: string;
  imo?: string;
  mmsi?: string;
  name?: string;
}

const unavailable = (req: AISLookupReq, message: string, stale = false): SafeAISResponse => ({
  vesselId: req.vesselId,
  imo: req.imo,
  mmsi: req.mmsi,
  latitude: null,
  longitude: null,
  course: null,
  speed: null,
  heading: null,
  navigationStatus: null,
  destination: null,
  eta: null,
  positionReceivedAt: null,
  provider: "unavailable",
  confidence: "none",
  isLive: false,
  stale,
  sanitizedPreview: message
});

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNullableString = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

export async function fetchAISPosition(req: AISLookupReq): Promise<SafeAISResponse> {
  const now = Date.now();
  const cached = aisCache.get(req.vesselId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const receivedAt = cached.positionReceivedAt ? new Date(cached.positionReceivedAt).getTime() : 0;
    const stale = receivedAt > 0 ? now - receivedAt > STALE_POSITION_MS : cached.stale;
    return { ...cached, stale, isLive: cached.isLive && !stale };
  }

  const providerUrl = (process.env.AIS_PROVIDER_URL || '').trim();
  const apiKey = (process.env.AIS_PROVIDER_KEY || '').trim();

  if (!providerUrl) {
    const result = unavailable(req, "AIS provider endpoint is not configured");
    aisCache.set(req.vesselId, { ...result, fetchedAt: now });
    return result;
  }

  try {
    const url = new URL(providerUrl);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error('AIS_PROVIDER_URL must use HTTPS in production');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Unsupported AIS provider protocol');
    }

    if (req.imo) url.searchParams.set('imo', String(req.imo));
    if (req.mmsi) url.searchParams.set('mmsi', String(req.mmsi));

    const headers: Record<string, string> = { accept: 'application/json' };
    if (apiKey) {
      const headerName = (process.env.AIS_PROVIDER_API_KEY_HEADER || 'Authorization').trim();
      headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(url.toString(), { headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`AIS provider HTTP ${response.status}`);
    }

    const raw = await response.json() as any;
    const payload = raw?.data ?? raw?.vessel ?? raw?.position ?? raw;

    const latitude = toNullableNumber(payload?.latitude ?? payload?.lat);
    const longitude = toNullableNumber(payload?.longitude ?? payload?.lon ?? payload?.lng);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('AIS provider returned invalid coordinates');
    }

    const receivedRaw = payload?.positionReceivedAt ?? payload?.timestamp ?? payload?.receivedAt ?? payload?.lastUpdate;
    const receivedDate = receivedRaw ? new Date(receivedRaw) : new Date();
    if (Number.isNaN(receivedDate.getTime())) {
      throw new Error('AIS provider returned invalid position timestamp');
    }

    const stale = now - receivedDate.getTime() > STALE_POSITION_MS;
    const providerName = String(raw?.provider || payload?.provider || 'external_ais_provider').slice(0, 80);

    const result: SafeAISResponse = {
      vesselId: req.vesselId,
      imo: req.imo,
      mmsi: req.mmsi,
      latitude,
      longitude,
      course: toNullableNumber(payload?.course ?? payload?.cog),
      speed: toNullableNumber(payload?.speed ?? payload?.sog),
      heading: toNullableNumber(payload?.heading),
      navigationStatus: toNullableString(payload?.navigationStatus ?? payload?.navStatus),
      destination: toNullableString(payload?.destination),
      eta: toNullableString(payload?.eta),
      positionReceivedAt: receivedDate.toISOString(),
      provider: providerName,
      confidence: stale ? "low" : "high",
      isLive: !stale,
      stale,
      sanitizedPreview: stale
        ? `AIS position available but stale (${receivedDate.toISOString()})`
        : `AIS position updated ${receivedDate.toISOString()}`
    };

    aisCache.set(req.vesselId, { ...result, fetchedAt: now });
    return result;
  } catch (error: any) {
    console.error("AIS fetch error:", error?.message || error);
    const result = unavailable(req, "AIS lookup unavailable", true);
    aisCache.set(req.vesselId, { ...result, fetchedAt: now });
    return result;
  }
}

export function getAISProviderStatus() {
  const configured = !!process.env.AIS_PROVIDER_URL;
  return {
    configured,
    health: configured ? "configured_unverified" : "not_configured",
    providerUrlConfigured: configured
  };
}
