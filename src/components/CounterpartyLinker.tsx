import React, { useState, useEffect } from 'react';
import { Counterparty, crmService } from '../lib/crmService';
import { useAuth } from '../lib/firebase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { Plus, Users, X, User } from 'lucide-react';

export const CounterpartyLinker: React.FC<{ itemId: string, itemType: string }> = ({ itemId, itemType }) => {
  const { user } = useAuth();
  const [deskId, setDeskId] = useState<string | null>(null);
  const [cps, setCps] = useState<Counterparty[]>([]);
  const [isLinking, setIsLinking] = useState(false);

  useEffect(() => {
    if (!user) return;
    import('firebase/firestore').then(({ getDoc, doc }) => {
      import('../lib/firebase').then(({ db }) => {
        getDoc(doc(db, 'users', user.uid)).then(snap => {
           if (snap.exists()) setDeskId(snap.data().deskId || null);
        });
      });
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = crmService.subscribeCounterparties(user.uid, deskId, (data) => {
       setCps(data);
    });
    return () => unsub();
  }, [user, deskId]);

  const linkedCps = cps.filter(cp => cp.linkedItemIds?.includes(itemId));
  const availableCps = cps.filter(cp => !cp.linkedItemIds?.includes(itemId));

  const handleLink = async (cpId: string) => {
    await crmService.linkItem(cpId, itemId);
    setIsLinking(false);
  };

  const handleUnlink = async (cpId: string) => {
    await crmService.unlinkItem(cpId, itemId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
         <h4 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] flex items-center gap-3">
           <div className="w-8 h-[1px] bg-primary/30"></div>
           Linked Counterparties
         </h4>
         <button onClick={() => setIsLinking(!isLinking)} className="flex items-center gap-1 text-[9px] font-bold tracking-widest text-primary uppercase hover:bg-primary/10 px-2 py-0.5 rounded-sm transition-colors border border-transparent hover:border-primary/20">
            {isLinking ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />} {isLinking ? 'Cancel' : 'Link Counterparty'}
         </button>
      </div>

      {isLinking && (
        <div className="bg-surface-container border border-outline/30 p-2 max-h-48 overflow-y-auto no-scrollbar">
           {availableCps.map(cp => (
             <div key={cp.id} onClick={() => handleLink(cp.id)} className="flex items-center justify-between p-2 hover:bg-surface-container-high cursor-pointer group rounded-sm transition-colors">
                <div>
                   <div className="text-xs text-on-surface font-sans group-hover:text-primary transition-colors">{cp.name}</div>
                   <div className="text-[9px] text-on-surface-variant flex items-center gap-2 uppercase tracking-widest">{cp.company || 'Unknown'} &bull; {cp.type}</div>
                </div>
                <div className="text-[9px] font-bold text-primary uppercase tracker-widest">Link</div>
             </div>
           ))}
           {availableCps.length === 0 && <div className="text-[10px] text-center text-on-surface-variant p-4">No counterparties available to link. Add them in the CRM.</div>}
        </div>
      )}

      {linkedCps.length > 0 && (
        <div className="space-y-2">
          {linkedCps.map(cp => (
            <div key={cp.id} className="bg-surface-container-low p-3 border border-outline/20 rounded-sm flex items-center justify-between group">
               <div className="flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20"><User className="w-4 h-4 text-primary" /></div>
                 <div>
                   <div className="text-xs font-bold text-on-surface uppercase">{cp.name}</div>
                   <div className="text-[9px] text-on-surface-variant uppercase tracking-widest font-mono">{cp.company} &bull; {cp.type}</div>
                 </div>
               </div>
               <button onClick={() => handleUnlink(cp.id)} className="text-[9px] text-on-surface-variant hover:text-error hover:bg-error/10 px-2 py-1 uppercase tracking-widest transition-colors font-bold rounded-sm border border-transparent hover:border-error/20">
                 Unlink
               </button>
            </div>
          ))}
        </div>
      )}
      
      {!isLinking && linkedCps.length === 0 && (
        <div className="text-center p-4 bg-surface-container-low/50 border border-dashed border-outline/30 rounded-sm">
           <div className="text-[9px] uppercase tracking-widest text-on-surface-variant">No counterparties linked</div>
        </div>
      )}
    </div>
  );
};
