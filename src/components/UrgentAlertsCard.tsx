import React from 'react';
import { useAlerts } from '../lib/AlertContext';
import { ShieldAlert, Zap, Target, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';

export function UrgentAlertsCard() {
  const { alerts, markAsRead } = useAlerts();

  const navigate = (path: string) => {
      window.dispatchEvent(new CustomEvent('navigate-to', { detail: path }));
  };

  const urgentAlerts = alerts.filter(a => !a.read && ['critical', 'high'].includes(a.priority));

  if (urgentAlerts.length === 0) {
    return null; // Don't show if no urgent alerts
  }

  return (
    <div className="bg-surface-container border border-error/30 p-6 relative overflow-hidden shadow-[0_0_15px_rgba(var(--color-error),0.05)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
           <ShieldAlert className="w-5 h-5 text-error" />
           <h2 className="text-[16px] font-bold uppercase tracking-widest text-on-surface">Action Required</h2>
           <span className="bg-error/10 text-error px-2 py-0.5 text-[9px] uppercase tracking-widest ml-2 font-mono">{urgentAlerts.length} Urgent</span>
        </div>
      </div>
      
      <div className="space-y-2">
         {urgentAlerts.slice(0, 3).map(a => (
            <div key={a.id} className="p-3 bg-surface border border-error/20 flex items-start justify-between gap-4">
              <div>
                 <div className="text-[12px] font-bold text-on-surface mb-1 flex items-center gap-2">
                   {a.priority === 'critical' ? <Zap className="w-3 h-3 text-error" /> : <Target className="w-3 h-3 text-tertiary" />}
                   {a.title}
                 </div>
                 <div className="text-[11px] text-on-surface-variant font-sans line-clamp-2">{a.message}</div>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                 <span className="text-[9px] font-mono text-on-surface-variant">{formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                 <button 
                  onClick={() => {
                     markAsRead(a.id);
                     if (a.actionRoute) {
                        if (a.actionRoute.startsWith('/')) navigate(a.actionRoute);
                     }
                  }}
                  className="bg-error text-white font-bold text-[9px] uppercase tracking-widest px-3 py-1.5 hover:bg-error/90 transition-colors"
                 >
                   Resolve
                 </button>
              </div>
            </div>
         ))}
      </div>
    </div>
  );
}
