import React, { useEffect, useState } from 'react';
import { Bot, RefreshCw, Zap } from 'lucide-react';
import { useAuth, db } from '../lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { useWorkspace } from '../lib/WorkspaceContext';

export function DailyDigestCard({ setActiveTab }: { setActiveTab: (t: string) => void }) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [digest, setDigest] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
     const fetchDigest = async () => {
        if (!user) return;
        const ts = new Date().toISOString().split('T')[0];
        const q = query(collection(db, 'dailyDigests'), where('recipientUid', '==', user.uid), where('date', '==', ts), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
           setDigest(snap.docs[0].data());
        }
     };
     fetchDigest();
  }, [user]);

  return (
    <div className="bg-surface border border-outline/50 p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[14px] font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
           <Zap className="w-5 h-5 text-tertiary" />
           Executive Brief
        </h2>
        <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">{new Date().toLocaleDateString()}</span>
      </div>

      {!digest && !loading ? (
        <div className="bg-surface-container-low border border-outline/50 border-dashed p-6 text-center">
           <Bot className="w-8 h-8 text-primary/40 mx-auto mb-3" />
           <p className="text-[11px] text-on-surface-variant font-mono mb-4">No digest generated for today yet. The system analyzes market matches, hot opportunities, and open deal rooms at your configured time to produce an executive brief.</p>
           <button 
             onClick={async () => {
               setLoading(true);
               const { generateDailyDigest } = await import('../lib/alertService');
               const deskId = currentWorkspace?.id || user?.uid || '';
               const res = await generateDailyDigest(user!.uid, deskId);
               setDigest(res);
               setLoading(false);
             }} 
             className="text-[9px] uppercase tracking-widest font-bold bg-primary text-black border border-outline px-4 py-2 hover:bg-primary/90 transition-colors"
           >
             Generate Executive Brief
           </button>
        </div>
      ) : loading ? (
         <div className="p-8 flex justify-center items-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
         </div>
      ) : (
        <div className="space-y-4">
           {digest.topMatches && digest.topMatches.length > 0 && (
             <div className="p-3 bg-surface-container-low border border-outline/30">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface mb-2 text-tertiary">Top Matches</h3>
                <ul className="space-y-1">
                  {digest.topMatches.map((m: any, i: number) => (
                    <li key={i} className="text-[11px] font-sans text-on-surface-variant flex justify-between">
                       <span>{m.title}</span> <strong className="text-primary">{m.percent}%</strong>
                    </li>
                  ))}
                </ul>
             </div>
           )}

           {digest.dealRoomsNeedingAction && digest.dealRoomsNeedingAction.length > 0 && (
             <div className="p-3 bg-surface-container-low border border-outline/30">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-on-surface mb-2">Deal Rooms Action Items</h3>
                <ul className="space-y-1">
                  {digest.dealRoomsNeedingAction.map((dr: any, i: number) => (
                    <li key={i} className="text-[11px] font-sans text-on-surface-variant flex items-center justify-between">
                       <span>{dr.title}</span>
                       <button onClick={() => setActiveTab('deal-rooms')} className="text-[9px] uppercase text-primary font-bold">Review</button>
                    </li>
                  ))}
                </ul>
             </div>
           )}

           <div className="mt-4 pt-4 border-t border-outline/30">
              <div className="text-[10px] uppercase font-mono text-on-surface-variant text-right">Generated: {new Date(digest.generatedAt).toLocaleTimeString()}</div>
           </div>
        </div>
      )}
    </div>
  );
}
