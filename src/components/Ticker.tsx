import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Activity, Settings2 } from 'lucide-react';
import { useConfig } from '../lib/ConfigContext';

export const Ticker: React.FC<{ onConfigure?: () => void }> = ({ onConfigure }) => {
  const { tickerItems } = useConfig();
  const visibleItems = tickerItems.filter(item => item.isVisible);

  if (visibleItems.length === 0 && !onConfigure) return null;

  return (
    <div className="h-8 bg-surface-container border-b border-outline flex items-center overflow-hidden whitespace-nowrap z-50 shadow-[0_4px_10px_rgba(0,0,0,0.2)] relative shrink-0 group">
      <div className="flex items-center px-6 bg-surface border-r border-outline h-full shadow-[10px_0_15px_rgba(0,0,0,0.8)] z-10 relative">
        <Activity className="h-4 w-4 text-primary mr-3" strokeWidth={1.5} />
        <span className="text-[9px] font-medium text-primary uppercase tracking-[0.2em]">Live Market</span>
        <button 
          onClick={onConfigure}
          className="ml-4 p-1 hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all opacity-0 group-hover:opacity-100 rounded-sm"
          title="Configure Ticker"
        >
          <Settings2 className="h-3 w-3" />
        </button>
        <div className="absolute top-0 bottom-0 -right-4 w-4 bg-gradient-to-r from-surface to-transparent pointer-events-none" />
      </div>

      <motion.div 
        className="flex items-center gap-10 px-8"
        animate={{ x: [0, -1500] }}
        transition={{ 
          duration: 50, 
          repeat: Infinity, 
          ease: "linear" 
        }}
      >
        {/* Duplicate list to create seamless loop */}
        {[...visibleItems, ...visibleItems, ...visibleItems, ...visibleItems].map((item, idx) => (
          <div key={`${item.id}-${idx}`} className="flex items-center gap-3 font-mono text-[11px] tracking-wide">
            <span className="text-on-surface-variant font-medium">{item.label}</span>
            <span className="text-on-surface font-semibold">{item.price}</span>
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-surface-container-high ${item.isUp ? 'text-tertiary' : 'text-error'}`}>
              {item.isUp ? <TrendingUp className="h-3 w-3" strokeWidth={2} /> : <TrendingDown className="h-3 w-3" strokeWidth={2} />}
              {item.change}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
};
