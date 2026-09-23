import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Fuel, RefreshCw, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';

type MarketIndex = {
  indexCode: string;
  indexName: string;
  value: number;
  changePoints: number;
  changePercent: number;
  timestamp: string;
  source: string;
};

type MarketRoute = {
  routeCode: string;
  routeName: string;
  segment: string;
  rate: number;
  rateUnit: string;
  change: number;
  timestamp: string;
  source: string;
};

type MarketSnapshot = {
  available: boolean;
  timestamp: string;
  source: string;
  isSimulated: boolean;
  indices: MarketIndex[];
  routes: MarketRoute[];
  warning?: string;
};

type BunkerPrice = {
  portCode: string;
  portName: string;
  region: string;
  fuelType: string;
  priceUsd: number;
  changeUsd: number;
  changePercent: number;
  timestamp: string;
  source: string;
};

type BunkerSnapshot = {
  available: boolean;
  timestamp: string;
  source: string;
  isSimulated: boolean;
  prices: BunkerPrice[];
  globalAverages: Record<string, number>;
  warning?: string;
};

type MarketAnalysis = {
  trend?: string;
  confidence?: number;
  sentiment_score?: number;
  regions?: Array<{ name?: string; trend?: string; activity?: string }>;
  cargo_activity?: Array<{ commodity?: string; trend?: string; note?: string }>;
  vessel_supply?: Array<{ segment?: string; availability?: string; note?: string }>;
  key_points?: string[];
  ai_summary?: string;
  text?: string;
  actualProvider?: string;
  actualModel?: string;
  degraded_analysis?: boolean;
};

async function authJson(url: string, init?: RequestInit) {
  if (!auth.currentUser) throw new Error('Authentication required');
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
      Authorization: `Bearer ${idToken}`,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.safeMessage || body.error || `Request failed (${response.status})`);
  }
  return body;
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function DataBadge({ simulated, source }: { simulated: boolean; source: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[9px] font-mono uppercase tracking-widest',
        simulated
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
          : 'border-tertiary/30 bg-tertiary/10 text-tertiary'
      )}
    >
      {simulated ? 'SIMULATED' : 'LIVE/PROVIDER'} · {source}
    </span>
  );
}

function EmptyProvider({ title, warning }: { title: string; warning?: string }) {
  return (
    <div className="border border-outline/40 bg-surface-container-low p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <div className="text-sm font-semibold text-on-surface">{title}</div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-on-surface-variant">
            {warning || 'Provider is not configured.'}
          </p>
          <p className="mt-3 text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
            Production intentionally refuses to invent live market values. Configure a licensed provider or use reference mode only for testing.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MarketIntel() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [bunkers, setBunkers] = useState<BunkerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reportText, setReportText] = useState('');
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [marketData, bunkerData] = await Promise.all([
        authJson('/api/market/snapshot'),
        authJson('/api/market/bunkers'),
      ]);
      setMarket(marketData);
      setBunkers(bunkerData);
    } catch (error: any) {
      setLoadError(error.message || 'Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const bunkerRows = useMemo(() => {
    if (!bunkers?.prices?.length) return [];
    const preferred = bunkers.prices.filter(price => price.fuelType === 'vlsfo');
    return (preferred.length ? preferred : bunkers.prices).slice(0, 12);
  }, [bunkers]);

  const analyzeReport = async () => {
    const text = reportText.trim();
    if (text.length < 30) {
      setAnalysisError('Paste at least a short broker circular or market report.');
      return;
    }

    setAnalyzing(true);
    setAnalysisError('');
    try {
      const result = await authJson('/api/ai/routeTask', {
        method: 'POST',
        body: JSON.stringify({
          taskType: 'parse_market_report',
          payload: { contents: text },
        }),
      });
      setAnalysis(result);
    } catch (error: any) {
      setAnalysisError(error.message || 'Market report analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto p-3 pb-8 sm:p-6 lg:p-8 no-scrollbar">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 border-b border-outline/30 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="label-caps mb-2">Market Intelligence</div>
            <h1 className="text-3xl font-display font-semibold text-on-surface sm:text-4xl">Freight Market Desk</h1>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-on-surface-variant sm:text-sm">
              Baltic-style market context, bunker references and AI-assisted circular analysis. Live commercial decisions remain broker-controlled.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-outline bg-surface-container px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface hover:border-primary/50 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {loadError && (
          <div className="border border-error/30 bg-error/5 p-4 text-sm text-error">{loadError}</div>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-display font-semibold text-on-surface">Indices & route assessments</h2>
              <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Source transparency is mandatory
              </p>
            </div>
            {market && <DataBadge simulated={market.isSimulated} source={market.source} />}
          </div>

          {loading ? (
            <div className="h-32 animate-pulse border border-outline/30 bg-surface-container-low" />
          ) : market?.available ? (
            <>
              {market.warning && (
                <div className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">
                  {market.warning}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {market.indices.map(index => {
                  const up = index.changePercent > 0;
                  const down = index.changePercent < 0;
                  return (
                    <div key={index.indexCode} className="border border-outline/30 bg-surface-container-low p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-bold text-primary">{index.indexCode}</span>
                        {up ? <TrendingUp className="h-4 w-4 text-tertiary" /> : down ? <TrendingDown className="h-4 w-4 text-error" /> : <Activity className="h-4 w-4 text-on-surface-variant" />}
                      </div>
                      <div className="mt-3 font-mono text-xl font-semibold text-on-surface sm:text-2xl">{numberFormat.format(index.value)}</div>
                      <div className={cn('mt-1 text-[10px] font-mono', up ? 'text-tertiary' : down ? 'text-error' : 'text-on-surface-variant')}>
                        {index.changePercent > 0 ? '+' : ''}{numberFormat.format(index.changePercent)}%
                      </div>
                      <div className="mt-2 truncate text-[9px] uppercase tracking-wider text-on-surface-variant">{index.indexName}</div>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto border border-outline/30 bg-surface-container-low">
                <table className="min-w-[720px] w-full text-left">
                  <thead className="border-b border-outline/30 bg-surface-container">
                    <tr className="text-[9px] uppercase tracking-[0.18em] text-on-surface-variant">
                      <th className="px-3 py-3">Route</th>
                      <th className="px-3 py-3">Segment</th>
                      <th className="px-3 py-3">Assessment</th>
                      <th className="px-3 py-3">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {market.routes.map(route => (
                      <tr key={route.routeCode} className="border-b border-outline/20 last:border-0">
                        <td className="px-3 py-3">
                          <div className="font-mono text-xs font-semibold text-on-surface">{route.routeCode}</div>
                          <div className="mt-1 text-[10px] text-on-surface-variant">{route.routeName}</div>
                        </td>
                        <td className="px-3 py-3 text-[10px] uppercase tracking-wider text-on-surface-variant">{route.segment}</td>
                        <td className="px-3 py-3 font-mono text-xs text-on-surface">
                          {route.rateUnit === 'usd_mt' ? '$/MT ' : '$/DAY '}
                          {numberFormat.format(route.rate)}
                        </td>
                        <td className={cn('px-3 py-3 font-mono text-xs', route.change > 0 ? 'text-tertiary' : route.change < 0 ? 'text-error' : 'text-on-surface-variant')}>
                          {route.change > 0 ? '+' : ''}{numberFormat.format(route.change)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyProvider title="Live market feed not configured" warning={market?.warning} />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-display font-semibold text-on-surface">
                <Fuel className="h-5 w-5 text-primary" /> Bunker context
              </h2>
              <p className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">VLSFO reference for voyage economics</p>
            </div>
            {bunkers && <DataBadge simulated={bunkers.isSimulated} source={bunkers.source} />}
          </div>

          {!loading && bunkers?.available ? (
            <>
              {bunkers.warning && (
                <div className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-400">{bunkers.warning}</div>
              )}
              <div className="grid grid-cols-3 gap-2">
                {['vlsfo', 'mgo', 'hsfo'].map(fuel => (
                  <div key={fuel} className="border border-outline/30 bg-surface-container-low p-3 sm:p-4">
                    <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">{fuel}</div>
                    <div className="mt-2 font-mono text-lg font-semibold text-on-surface sm:text-2xl">
                      {bunkers.globalAverages?.[fuel] ? `$${numberFormat.format(bunkers.globalAverages[fuel])}` : '—'}
                    </div>
                    <div className="mt-1 text-[9px] uppercase tracking-wider text-on-surface-variant">Global avg / MT</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {bunkerRows.map(row => (
                  <div key={`${row.portCode}-${row.fuelType}`} className="border border-outline/30 bg-surface-container-low p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold text-primary">{row.portCode}</span>
                      <span className="text-[9px] uppercase tracking-wider text-on-surface-variant">{row.region}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-on-surface">{row.portName}</div>
                    <div className="mt-1 font-mono text-lg text-on-surface">${numberFormat.format(row.priceUsd)} <span className="text-[9px] text-on-surface-variant">VLSFO/MT</span></div>
                  </div>
                ))}
              </div>
            </>
          ) : !loading ? (
            <EmptyProvider title="Live bunker feed not configured" warning={bunkers?.warning} />
          ) : null}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="border border-outline/30 bg-surface-container-low p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-display font-semibold text-on-surface">AI circular analyzer</h2>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-on-surface-variant">
              Paste a market report or broker circular. The AI extracts trend, regional activity, cargo demand, vessel supply and key points without inventing missing rates.
            </p>
            <textarea
              value={reportText}
              onChange={event => setReportText(event.target.value)}
              placeholder="Paste broker circular / market report..."
              className="min-h-52 w-full resize-y border border-outline/40 bg-surface px-3 py-3 text-sm text-on-surface outline-none focus:border-primary/60"
            />
            {analysisError && <div className="mt-2 text-xs text-error">{analysisError}</div>}
            <button
              onClick={analyzeReport}
              disabled={analyzing || reportText.trim().length < 30}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-primary px-4 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-on-primary disabled:opacity-40 sm:w-auto"
            >
              {analyzing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              Analyze report
            </button>
          </div>

          <div className="border border-outline/30 bg-surface-container-low p-4 sm:p-5">
            <div className="label-caps mb-3">AI Market Verdict</div>
            {!analysis ? (
              <div className="flex min-h-52 items-center justify-center border border-dashed border-outline/40 p-6 text-center text-xs text-on-surface-variant">
                Analysis will appear here. No market conclusion is generated until you provide source text.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {analysis.trend && <span className="border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">{analysis.trend}</span>}
                  {typeof analysis.confidence === 'number' && <span className="text-[10px] font-mono text-on-surface-variant">CONF {Math.round(analysis.confidence * 100)}%</span>}
                  {analysis.actualProvider && <span className="text-[10px] font-mono text-on-surface-variant">{analysis.actualProvider}/{analysis.actualModel}</span>}
                  {analysis.degraded_analysis && <span className="text-[10px] font-mono text-amber-500">FALLBACK</span>}
                </div>
                <p className="text-sm leading-relaxed text-on-surface">{analysis.ai_summary || analysis.text || 'No summary returned.'}</p>
                {analysis.key_points?.length ? (
                  <div>
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">Key points</div>
                    <ul className="space-y-2">
                      {analysis.key_points.map((point, index) => (
                        <li key={index} className="flex gap-2 text-xs leading-relaxed text-on-surface-variant">
                          <span className="mt-1.5 h-1 w-1 shrink-0 bg-primary" /> {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
