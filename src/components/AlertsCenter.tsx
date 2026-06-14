import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ShieldAlert, AlertCircle, Info, X, CheckSquare, Zap, Target } from 'lucide-react';
import { useAlerts } from '../lib/AlertContext';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface AlertsCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AlertsCenter({ isOpen, onClose }: AlertsCenterProps) {
  const { alerts, unreadCount, markAsRead, markAllAsRead, dismiss, logActionClick } = useAlerts();
  const [filter, setFilter] = React.useState<string>('all');
  const [priorityFilter, setPriorityFilter] = React.useState<string>('all');

  const navigate = (path: string) => {
      // Very simple custom routing event
      window.dispatchEvent(new CustomEvent('navigate-to', { detail: path }));
  };

  const filtered = alerts.filter(a => {
     let match = true;
     if (filter === 'unread' && a.read) match = false;
     if (filter !== 'all' && filter !== 'unread' && a.category !== filter) match = false;
     if (priorityFilter !== 'all' && a.priority !== priorityFilter) match = false;
     return match;
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed top-20 right-4 sm:right-8 z-[200] w-[calc(100vw-2rem)] sm:w-[450px] max-h-[calc(100vh-140px)] flex flex-col bg-surface-container-high border border-outline shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-outline/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface-container-highest">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <span className="font-bold uppercase tracking-widest text-[14px] text-on-surface font-display">Smart Alerts</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-sm bg-primary/20 text-primary text-[9px] font-bold uppercase tracking-widest border border-primary/30 ml-2">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={markAllAsRead}
              title="Mark all as read"
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="text-on-surface-variant hover:text-on-surface transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col border-b border-outline/50 bg-surface-container px-2">
          <div className="flex overflow-x-auto no-scrollbar">
            {['all', 'unread', 'smart_radar_match', 'hot_opp', 'deal_room_update'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-3 py-3 text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-colors border-b-2",
                  filter === f ? "text-primary border-primary" : "text-on-surface-variant hover:text-on-surface border-transparent"
                )}
              >
                {f.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="flex gap-2 p-2 border-t border-outline/30 overflow-x-auto no-scrollbar">
             {['all', 'critical', 'high', 'medium', 'low', 'info'].map(p => (
                <button
                   key={p}
                   onClick={() => setPriorityFilter(p)}
                   className={cn(
                      "px-2 py-1 text-[9px] uppercase font-bold tracking-widest whitespace-nowrap border rounded-sm",
                      priorityFilter === p ? "bg-on-surface text-surface border-transparent" : "bg-surface border-outline/50 text-on-surface-variant hover:text-on-surface"
                   )}
                >
                   {p}
                </button>
             ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px] p-2 bg-surface">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-on-surface-variant">
              <Bell className="w-8 h-8 opacity-20 mb-3" />
              <div className="text-[11px] uppercase tracking-widest font-mono text-center">No alerts to action.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(a => (
                <div 
                  key={a.id} 
                  className={cn(
                    "p-4 border group transition-all relative overflow-hidden",
                    !a.read ? "bg-surface-container border-primary/30 shadow-[0_0_10px_rgba(var(--color-primary),0.05)]" : "bg-surface-container-low border-outline/30 opacity-70"
                  )}
                >
                  <div className="flex items-start justify-between gap-4 relative z-10">
                     <div className="flex items-start gap-3">
                        <div className="mt-1">
                           {a.priority === 'critical' ? <ShieldAlert className="w-4 h-4 text-error" /> :
                            a.priority === 'high' ? <Zap className="w-4 h-4 text-tertiary" /> :
                            a.priority === 'medium' ? <Target className="w-4 h-4 text-primary" /> :
                            <Info className="w-4 h-4 text-on-surface-variant" />}
                        </div>
                        <div>
                           <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-bold text-on-surface">{a.title}</span>
                              {a.createdBySystem && <span className="bg-tertiary/10 text-tertiary border border-tertiary/20 px-1 py-0.5 text-[8px] uppercase tracking-widest">System</span>}
                           </div>
                           <p className="text-[11px] text-on-surface-variant font-sans leading-relaxed">{a.message}</p>
                           
                           <div className="mt-3 flex items-center gap-3">
                              <button 
                                 onClick={() => {
                                    if (!a.read) markAsRead(a.id);
                                    logActionClick(a.id);
                                    if (a.actionRoute.startsWith('/')) {
                                       navigate(a.actionRoute);
                                    } else {
                                       // Assuming we fire a global event or open a generic overlay
                                    }
                                    onClose();
                                 }}
                                 className={cn(
                                   "px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors border",
                                   !a.read ? "bg-primary text-black border-primary hover:bg-primary/90" : "bg-transparent text-on-surface border-outline hover:bg-surface-container"
                                 )}
                              >
                                {a.actionLabel || 'View'}
                              </button>
                           </div>
                        </div>
                     </div>
                     <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[9px] font-mono whitespace-nowrap text-on-surface-variant">
                           {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           {!a.read && (
                             <button onClick={() => markAsRead(a.id)} className="text-[9px] text-on-surface-variant hover:text-on-surface font-bold uppercase tracking-widest bg-surface px-2 py-1 border border-outline">Mark Read</button>
                           )}
                           <button onClick={() => dismiss(a.id)} className="text-[9px] text-on-surface-variant hover:text-error font-bold uppercase tracking-widest bg-surface px-2 py-1 border border-outline"><X className="w-3 h-3" /></button>
                        </div>
                     </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
