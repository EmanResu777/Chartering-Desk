import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCircle2, AlertCircle, Info, X, Package, Ship, Zap, Network, ShieldAlert, CheckSquare } from 'lucide-react';
import { useNotification, AppNotification } from '../lib/NotificationContext';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, showNotificationCenter, setShowNotificationCenter } = useNotification();
  const [filter, setFilter] = React.useState<string>('all');

  const filtered = notifications.filter(n => filter === 'all' || n.entityType === filter);

  if (!showNotificationCenter) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150]" onClick={() => setShowNotificationCenter(false)} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20, x: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed top-20 right-4 sm:right-8 z-[200] w-[calc(100vw-2rem)] sm:w-[400px] max-h-[calc(100vh-140px)] flex flex-col bg-surface-container-high border border-outline shadow-2xl overflow-hidden"
      >
        <div className="p-4 border-b border-outline/50 flex items-center justify-between bg-surface-container-highest">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-bold uppercase tracking-widest text-[12px] text-on-surface">Alerts</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-sm bg-primary/20 text-primary text-[9px] font-bold">
                {unreadCount} NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              title="Mark all as read"
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              onClick={clearAll}
              title="Clear all"
              className="text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-outline/50 overflow-x-auto no-scrollbar bg-surface-container">
          {['all', 'cargo', 'vessel', 'match', 'risk', 'network', 'system'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-2 text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-colors border-b-2",
                filter === f ? "text-primary border-primary" : "text-on-surface-variant hover:text-on-surface border-transparent"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-on-surface-variant p-8">
              <Bell className="w-8 h-8 opacity-20 mb-2" />
              <div className="text-[10px] uppercase tracking-widest font-mono text-center">No alerts in this category</div>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-outline/30">
              {filtered.map(n => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-4 cursor-pointer hover:bg-surface-container transition-colors relative",
                    !n.read ? "bg-primary/5" : ""
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  {!n.read && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_8px_var(--color-primary)]" />
                  )}
                  <div className={cn("ml-2 transition-opacity", n.read ? "opacity-60" : "opacity-100")}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {n.severity === 'critical' && <ShieldAlert className="w-3 h-3 text-red-500" />}
                        {n.severity === 'warning' && <AlertCircle className="w-3 h-3 text-orange-400" />}
                        {n.severity === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                        {n.severity === 'info' && <Info className="w-3 h-3 text-blue-400" />}
                        <span className="text-[11px] font-bold uppercase tracking-widest font-sans text-on-surface line-clamp-1">{n.title}</span>
                      </div>
                      <span className="text-[9px] font-mono whitespace-nowrap text-on-surface-variant">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {n.message && (
                      <div className="text-[10px] text-on-surface-variant font-mono mt-1 pr-4 line-clamp-2 leading-relaxed">
                        {n.message}
                      </div>
                    )}
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
