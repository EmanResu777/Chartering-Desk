import React from 'react';
import { Package2, Ship, Zap, Bot, Bell } from 'lucide-react';
import { useAlerts } from '../lib/AlertContext';

export function QuickActionsCard({ setActiveTab }: { setActiveTab: (t: string) => void }) {
  const { setShowAlertsCenter } = useAlerts();

  return (
    <div className="bg-surface border border-outline/50 p-6">
      <h2 className="text-[12px] font-bold uppercase tracking-widest text-on-surface mb-6">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setActiveTab('cargo')} className="flex flex-col items-center justify-center p-4 bg-surface-container hover:bg-surface-container-high border border-outline/30 transition-colors py-6">
           <Package2 className="w-6 h-6 text-primary mb-2" />
           <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface">Add Cargo</span>
        </button>
        <button onClick={() => setActiveTab('vessel')} className="flex flex-col items-center justify-center p-4 bg-surface-container hover:bg-surface-container-high border border-outline/30 transition-colors py-6">
           <Ship className="w-6 h-6 text-primary mb-2" />
           <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface">Add Tonnage</span>
        </button>
        <button onClick={() => setActiveTab('radar')} className="flex flex-col items-center justify-center p-4 bg-surface-container hover:bg-surface-container-high border border-outline/30 transition-colors py-6">
           <Bot className="w-6 h-6 text-primary mb-2" />
           <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface">Smart Radar</span>
        </button>
        <button onClick={() => setShowAlertsCenter(true)} className="flex flex-col items-center justify-center p-4 bg-surface-container-high border-primary/30 border transition-colors py-6 shadow-[0_0_15px_rgba(var(--color-primary),0.05)] text-primary hover:bg-primary/5">
           <Bell className="w-6 h-6 mb-2" />
           <span className="text-[10px] uppercase font-bold tracking-widest text-primary">Alerts</span>
        </button>
      </div>
    </div>
  );
}
