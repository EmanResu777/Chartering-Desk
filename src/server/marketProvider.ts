export interface MarketIndex {
  indexCode: string;
  indexName: string;
  value: number;
  changePoints: number;
  changePercent: number;
  timestamp: string;
  source: string;
}

export interface MarketRoute {
  routeCode: string;
  routeName: string;
  segment: 'capesize' | 'panamax' | 'supramax' | 'handysize';
  rate: number;
  rateUnit: 'usd_mt' | 'usd_day';
  change: number;
  timestamp: string;
  source: string;
}

export interface MarketSnapshot {
  available: boolean;
  timestamp: string;
  source: string;
  isSimulated: boolean;
  indices: MarketIndex[];
  routes: MarketRoute[];
  warning?: string;
}

export interface BunkerPrice {
  portCode: string;
  portName: string;
  region: string;
  fuelType: 'vlsfo' | 'mgo' | 'hsfo';
  priceUsd: number;
  changeUsd: number;
  changePercent: number;
  timestamp: string;
  source: string;
}

export interface BunkerSnapshot {
  available: boolean;
  timestamp: string;
  source: string;
  isSimulated: boolean;
  prices: BunkerPrice[];
  globalAverages: Record<string, number>;
  warning?: string;
}

const DOSKA_REFERENCE_INDICES = [
  ['BDI', 'Baltic Dry Index', 1650],
  ['BCI', 'Baltic Capesize Index', 2850],
  ['BPI', 'Baltic Panamax Index', 1480],
  ['BSI', 'Baltic Supramax Index', 1120],
  ['BHSI', 'Baltic Handysize Index', 680],
] as const;

const DOSKA_REFERENCE_ROUTES = [
  ['C3', 'Tubarao-Qingdao', 'capesize', 22.5, 'usd_mt'],
  ['C5', 'W Australia-Qingdao', 'capesize', 9.8, 'usd_mt'],
  ['C5TC', 'Capesize T/C Average', 'capesize', 18500, 'usd_day'],
  ['P1A_82', 'Transatlantic RV', 'panamax', 12800, 'usd_day'],
  ['P3A_82', 'Pacific RV', 'panamax', 13500, 'usd_day'],
  ['P5TC_82', 'Panamax T/C Average', 'panamax', 13200, 'usd_day'],
  ['S4A_58', 'USG-Skaw-Pass', 'supramax', 18200, 'usd_day'],
  ['S10TC_58', 'Supramax T/C Average', 'supramax', 12800, 'usd_day'],
  ['HS7TC_38', 'Handysize T/C Average', 'handysize', 10200, 'usd_day'],
] as const;

const DOSKA_REFERENCE_BUNKERS = [
  ['SGSIN', 'Singapore', 'asia', 585, 720, 420],
  ['AEJEA', 'Fujairah', 'middle_east', 545, 680, 385],
  ['NLRTM', 'Rotterdam', 'europe', 535, 695, 375],
  ['GRPIR', 'Piraeus', 'europe', 558, 712, 395],
  ['USHOU', 'Houston', 'americas', 548, 685, 388],
  ['BRSTS', 'Santos', 'americas', 575, 718, 412],
  ['PANBA', 'Panama Canal', 'americas', 568, 705, 405],
  ['ZADUR', 'Durban', 'africa', 570, 712, 408],
] as const;

const normalizeUrl = (value: string | undefined) => (value || '').trim().replace(/\/+$/, '');

async function fetchProviderJson(urlValue: string, apiKey: string | undefined, timeoutMs = 8000): Promise<any> {
  const parsed = new URL(urlValue);
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Production market providers must use HTTPS');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Provider returned HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function referenceMarketSnapshot(): MarketSnapshot {
  const now = new Date().toISOString();
  return {
    available: true,
    timestamp: now,
    source: 'doska_reference_simulated',
    isSimulated: true,
    warning: 'SIMULATED reference data ported from Doska. Do not use for live fixing decisions.',
    indices: DOSKA_REFERENCE_INDICES.map(([indexCode, indexName, value]) => ({
      indexCode,
      indexName,
      value,
      changePoints: 0,
      changePercent: 0,
      timestamp: now,
      source: 'doska_reference_simulated',
    })),
    routes: DOSKA_REFERENCE_ROUTES.map(([routeCode, routeName, segment, rate, rateUnit]) => ({
      routeCode,
      routeName,
      segment,
      rate,
      rateUnit,
      change: 0,
      timestamp: now,
      source: 'doska_reference_simulated',
    })),
  };
}

function referenceBunkerSnapshot(): BunkerSnapshot {
  const now = new Date().toISOString();
  const prices: BunkerPrice[] = [];

  for (const [portCode, portName, region, vlsfo, mgo, hsfo] of DOSKA_REFERENCE_BUNKERS) {
    for (const [fuelType, priceUsd] of [
      ['vlsfo', vlsfo],
      ['mgo', mgo],
      ['hsfo', hsfo],
    ] as const) {
      prices.push({
        portCode,
        portName,
        region,
        fuelType,
        priceUsd,
        changeUsd: 0,
        changePercent: 0,
        timestamp: now,
        source: 'doska_reference_simulated',
      });
    }
  }

  const globalAverages: Record<string, number> = {};
  for (const fuelType of ['vlsfo', 'mgo', 'hsfo'] as const) {
    const values = prices.filter(p => p.fuelType === fuelType).map(p => p.priceUsd);
    globalAverages[fuelType] = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0;
  }

  return {
    available: true,
    timestamp: now,
    source: 'doska_reference_simulated',
    isSimulated: true,
    warning: 'SIMULATED reference bunker data ported from Doska. Replace with a licensed live provider for production decisions.',
    prices,
    globalAverages,
  };
}

function normalizeMarketSnapshot(input: any, source: string): MarketSnapshot {
  const now = new Date().toISOString();
  const indices = Array.isArray(input?.indices) ? input.indices : [];
  const routes = Array.isArray(input?.routes) ? input.routes : [];

  return {
    available: true,
    timestamp: String(input?.timestamp || now),
    source: String(input?.source || source),
    isSimulated: Boolean(input?.isSimulated || input?.is_simulated),
    indices: indices
      .map((item: any) => ({
        indexCode: String(item.indexCode ?? item.index_code ?? item.code ?? ''),
        indexName: String(item.indexName ?? item.index_name ?? item.name ?? ''),
        value: Number(item.value ?? 0),
        changePoints: Number(item.changePoints ?? item.change_points ?? item.change ?? 0),
        changePercent: Number(item.changePercent ?? item.change_percent ?? 0),
        timestamp: String(item.timestamp || input?.timestamp || now),
        source: String(item.source || input?.source || source),
      }))
      .filter((item: MarketIndex) => item.indexCode && Number.isFinite(item.value)),
    routes: routes
      .map((item: any) => ({
        routeCode: String(item.routeCode ?? item.route_code ?? item.code ?? ''),
        routeName: String(item.routeName ?? item.route_name ?? item.name ?? ''),
        segment: String(item.segment || '').toLowerCase(),
        rate: Number(item.rate ?? 0),
        rateUnit: String(item.rateUnit ?? item.rate_unit ?? 'usd_day'),
        change: Number(item.change ?? 0),
        timestamp: String(item.timestamp || input?.timestamp || now),
        source: String(item.source || input?.source || source),
      }))
      .filter((item: any) =>
        item.routeCode &&
        Number.isFinite(item.rate) &&
        ['capesize', 'panamax', 'supramax', 'handysize'].includes(item.segment) &&
        ['usd_mt', 'usd_day'].includes(item.rateUnit)
      ) as MarketRoute[],
  };
}

function normalizeBunkerSnapshot(input: any, source: string): BunkerSnapshot {
  const now = new Date().toISOString();
  const prices = Array.isArray(input?.prices) ? input.prices : [];

  return {
    available: true,
    timestamp: String(input?.timestamp || now),
    source: String(input?.source || source),
    isSimulated: Boolean(input?.isSimulated || input?.is_simulated),
    prices: prices
      .map((item: any) => ({
        portCode: String(item.portCode ?? item.port_code ?? ''),
        portName: String(item.portName ?? item.port_name ?? ''),
        region: String(item.region ?? ''),
        fuelType: String(item.fuelType ?? item.fuel_type ?? '').toLowerCase(),
        priceUsd: Number(item.priceUsd ?? item.price_usd ?? item.price ?? 0),
        changeUsd: Number(item.changeUsd ?? item.change_usd ?? 0),
        changePercent: Number(item.changePercent ?? item.change_percent ?? 0),
        timestamp: String(item.timestamp || input?.timestamp || now),
        source: String(item.source || input?.source || source),
      }))
      .filter((item: any) =>
        item.portCode &&
        Number.isFinite(item.priceUsd) &&
        item.priceUsd > 0 &&
        ['vlsfo', 'mgo', 'hsfo'].includes(item.fuelType)
      ) as BunkerPrice[],
    globalAverages: input?.globalAverages || input?.global_averages || {},
  };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  const providerUrl = normalizeUrl(process.env.MARKET_SNAPSHOT_URL);
  if (providerUrl) {
    try {
      const data = await fetchProviderJson(providerUrl, process.env.MARKET_DATA_API_KEY);
      return normalizeMarketSnapshot(data, 'external_market_provider');
    } catch (error: any) {
      return {
        available: false,
        timestamp: new Date().toISOString(),
        source: 'external_market_provider',
        isSimulated: false,
        indices: [],
        routes: [],
        warning: `Market provider unavailable: ${error.message}`,
      };
    }
  }

  const allowReference = process.env.MARKET_REFERENCE_MODE === 'true' &&
    (process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATED_MARKET_DATA === 'true');

  if (allowReference) return referenceMarketSnapshot();

  return {
    available: false,
    timestamp: new Date().toISOString(),
    source: 'unconfigured',
    isSimulated: false,
    indices: [],
    routes: [],
    warning: 'No licensed live market data provider is configured.',
  };
}

export async function getBunkerSnapshot(): Promise<BunkerSnapshot> {
  const providerUrl = normalizeUrl(process.env.BUNKER_SNAPSHOT_URL);
  if (providerUrl) {
    try {
      const data = await fetchProviderJson(providerUrl, process.env.BUNKER_DATA_API_KEY);
      return normalizeBunkerSnapshot(data, 'external_bunker_provider');
    } catch (error: any) {
      return {
        available: false,
        timestamp: new Date().toISOString(),
        source: 'external_bunker_provider',
        isSimulated: false,
        prices: [],
        globalAverages: {},
        warning: `Bunker provider unavailable: ${error.message}`,
      };
    }
  }

  const allowReference = process.env.MARKET_REFERENCE_MODE === 'true' &&
    (process.env.NODE_ENV !== 'production' || process.env.ALLOW_SIMULATED_MARKET_DATA === 'true');

  if (allowReference) return referenceBunkerSnapshot();

  return {
    available: false,
    timestamp: new Date().toISOString(),
    source: 'unconfigured',
    isSimulated: false,
    prices: [],
    globalAverages: {},
    warning: 'No licensed live bunker data provider is configured.',
  };
}
