import React, { useEffect, useState } from 'react';
import { Briefcase, ArrowRight } from 'lucide-react';
import { useAuth, db } from '../lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

export function ActionableDealRoomsCard({ setActiveTab }: { setActiveTab: (t: string) => void }) {
  const { user } = useAuth();
  const [dealRooms, setDealRooms] = useState<any[]>([]);

  useEffect(() => {
     const run = async () => {
        if (!user) return;
        const q = query(
           collection(db, 'dealRooms'),
           where('participantUids', 'array-contains', user.uid),
           where('status', 'in', ['negotiating', 'fixture_draft', 'recap_draft', 'recap_pending_broker']),
           orderBy('updatedAt', 'desc'),
           limit(3)
        );
        try {
           const snap = await getDocs(q);
           setDealRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
           console.error("Deal rooms card error:", err);
        }
     };
     run();
  }, [user]);

  if (dealRooms.length === 0) return null;

  return (
    <div className="bg-surface-container border border-outline/30 p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
           <Briefcase className="w-5 h-5 text-primary" />
           <h2 className="text-[14px] font-bold uppercase tracking-widest text-on-surface">Active Deal Rooms</h2>
        </div>
      </div>
      
      <div className="space-y-3 flex flex-col">
         {dealRooms.map(dr => (
            <button 
              key={dr.id} 
              onClick={() => setActiveTab('deal-rooms')}
              className="text-left p-3 border border-outline/50 hover:border-primary/50 transition-colors bg-surface-container-low group flex justify-between items-center"
            >
              <div>
                <div className="text-[12px] font-bold text-on-surface line-clamp-1 mb-1">{dr.title}</div>
                <div className="text-[10px] font-mono text-on-surface-variant uppercase">{dr.status}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
         ))}
      </div>
    </div>
  );
}
