import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Activity, Settings2, AlertTriangle } from 'lucide-react';
import { auth } from '../lib/firebase';

type TickerRow = {
  id: string;
  label: string;
  price: string;
  change: string;
  isUp: boolean;
};

export const Ticker: React.FC<{ onConfigure?: () => void }> = ({ onConfigure }) => {
  const [items, setItems] = React.useState<TickerRow[]>([]);
  const [source, setSource] = React.useState('');
  const [isSimulated, setIsSimulated] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!auth.currentUser) return;
      try {
        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/market/snapshot', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.available) {
          if (!cancelled) setUnavailable(true);
          return;
        }

        const indexRows: TickerRow[] = (body.indices || []).slice(0, 5).map((item: any) => ({
          id: String(item.indexCode),
          label: String(item.indexCode),
          price: Number(item.value).toLocaleString('en-US', { maximumFractionDigits: 1 }),
          change: `${Number(item.changePercent) >= 0 ? '+' : ''}${Number(item.changePercent).toFixed(1)}%`,
          isUp: Number(item.changePercent) >= 0,
        }));

        const routeRows: TickerRow[] = (body.routes || []).slice(0, 5).map((item: any) => ({
          id: String(item.routeCode),
          label: String(item.routeCode),
          price: `${item.rateUnit === 'usd_mt' ? '$/MT ' : '$/DAY '}${Number(item.rate).toLocaleString('en-US', { maximumFractionDigits: 1 })}`,
          change: `${Number(item.change) >= 0 ? '+' : ''}${Number(item.change).toLocaleString('en-US', { maximumFractionDigits: 1 })}`,
          isUp: Number(item.change) >= 0,
        }));

        if (!cancelled) {
          setItems([...indexRows, ...routeRows]);
          setSource(String(body.source || 'provider'));
          setIsSimulated(Boolean(body.isSimulated));
          setUnavailable(false);
        }
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    };

    load();
    const timer = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="h-8 bg-surface-container border-b border-outline flex items-center justify-between px-3 sm:px-6 z-50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {unavailable ? <AlertTriangle className="h-3.5 w-3.5 text-primary shrink-0" /> : <Activity className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />}
          <span className="text-[8px] sm:text-[9px] font-medium text-on-surface-variant uppercase tracking-[0.16em] truncate">
            {unavailable ? 'Market feed not configured' : 'Market feed loading'}
          </span>
        </div>
        {onConfigure && (
          <button onClick={onConfigure} className="p-1 text-on-surface-variant hover:text-primary" title="Market settings">
            <Settings2 className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-8 bg-surface-container border-b border-outline flex items-center overflow-hidden whitespace-nowrap z-50 relative shrink-0 group">
      <div className="flex items-center px-3 sm:px-5 bg-surface border-r border-outline h-full z-10 relative shrink-0">
        <Activity className="h-3.5 w-3.5 text-primary mr-2" strokeWidth={1.5} />
        <span className="text-[8px] sm:text-[9px] font-medium text-primary uppercase tracking-[0.16em]">
          {isSimulated ? 'Market · Simulated' : 'Market'}
        </span>
        <span className="hidden lg:inline ml-2 text-[7px] uppercase tracking-wider text-on-surface-variant">{source}</span>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="ml-2 p-1 hover:bg-primary/10 text-on-surface-variant hover:text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            title="Market settings"
          >
            <Settings2 className="h-3 w-3" />
          </button>
        )}
      </div>

      <motion.div
        className="flex items-center gap-7 px-6"
        animate={{ x: [0, -1200] }}
        transition={{ duration: 55, repeat: Infinity, ease: 'linear' }}
      >
        {[...items, ...items, ...items].map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-2 font-mono text-[10px] tracking-wide">
            <span className="text-on-surface-variant font-medium">{item.label}</span>
            <span className="text-on-surface font-semibold">{item.price}</span>
            <span className={`flex items-center gap-1 px-1 py-0.5 ${item.isUp ? 'text-tertiary' : 'text-error'}`}>
              {item.isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {item.change}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
};
