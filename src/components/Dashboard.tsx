import React from 'react';
import { useAuth } from '../lib/firebase';
import { useConfig } from '../lib/ConfigContext';
import { ActionableDealRoomsCard } from './ActionableDealRoomsCard';
import { QuickActionsCard } from './QuickActionsCard';
import { UrgentAlertsCard } from './UrgentAlertsCard';
import { DailyDigestCard } from './DailyDigestCard';
import { OpportunityMap } from './OpportunityMap';

export function Dashboard({ setActiveTab }: { setActiveTab: (t: any) => void }) {
  const { user } = useAuth();
  const { t } = useConfig();
  
  return (
    <div className="h-full flex flex-col p-4 sm:p-8 overflow-y-auto w-full no-scrollbar">
      <div className="mb-8 flex justify-between items-end">
         <div>
           <h1 className="text-3xl sm:text-4xl font-display font-bold uppercase tracking-wider text-on-surface">Dashboard</h1>
           <p className="text-on-surface-variant font-mono text-[10px] sm:text-xs">
             {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
           </p>
         </div>
      </div>

      <div className="max-w-[1400px] w-full grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
        
        {/* Full width map on top */}
        <div className="col-span-1 lg:col-span-12 mb-2">
           <OpportunityMap items={[]} />
        </div>

        {/* Left Column: Alerts & Actions */}
        <div className="col-span-1 lg:col-span-7 space-y-6">
           <UrgentAlertsCard />
           <QuickActionsCard setActiveTab={setActiveTab} />
           <ActionableDealRoomsCard setActiveTab={setActiveTab} />
        </div>

        {/* Right Column: Digest & Flow */}
        <div className="col-span-1 lg:col-span-5 space-y-6">
           <DailyDigestCard setActiveTab={setActiveTab} />
        </div>
        
      </div>
    </div>
  );
}
