import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Plus, Radar, CheckSquare, Settings, Save, X, Search, ShieldCheck, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth, db } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, onSnapshot, setDoc, doc, deleteDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';

import { AIDealBriefCard } from './AIDealBriefCard';
import { CounterpartyLinker } from './CounterpartyLinker';
import { VoyageEstimateSection } from './VoyageEstimateSection';
import { OpportunityMap } from './OpportunityMap';

interface Watchlist {
  id: string;
  name: string;
  type: string;
  filters: any;
  visibility: 'private' | 'my_desk';
  status: 'active' | 'paused' | 'archived';
  createdByUid: string;
  createdByDeskId?: string;
}

export const SmartRadar: React.FC = () => {
  const { user } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'matches' | 'watchlists' | 'create' | 'settings'>('matches');
  
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [newWatchlist, setNewWatchlist] = useState<Partial<Watchlist>>({
    name: '',
    type: 'cargo',
    visibility: 'private',
    status: 'active',
    filters: {}
  });

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'watchlists'), 
      where('createdByUid', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setWatchlists(snap.docs.map(d => ({ id: d.id, ...d.data() } as Watchlist)));
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleCreateWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newWatchlist.name) return;

    try {
      const id = doc(collection(db, 'watchlists')).id;
      await setDoc(doc(db, 'watchlists', id), {
        ...newWatchlist,
        id,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        audit: [{ action: 'created', timestamp: new Date().toISOString(), by: user.uid }]
      });
      setNewWatchlist({ name: '', type: 'cargo', visibility: 'private', status: 'active', filters: {} });
      setActiveSubTab('watchlists');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-surface-container-low pb-32 md:pb-8 flex flex-col h-full">
      <div className="max-w-6xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-outline/30 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-display font-light text-primary uppercase tracking-wider">Smart Radar</h2>
            </div>
            <p className="text-xs text-on-surface-variant max-w-xl">
              AI-assisted market monitoring. Create highly specific watchlists, and the system will scan Market Requests, Network Desks, and Inbox feeds to provide scored matches.
            </p>
          </div>
        </div>

        {/* Local Nav */}
        <div className="flex flex-wrap border-b border-outline/30 text-xs">
          {[
            { id: 'matches', label: 'Dashboard: Today\'s Best Matches', icon: Radar },
            { id: 'watchlists', label: 'My Watchlists', icon: Save },
            { id: 'create', label: 'Create Watchlist', icon: Plus },
            { id: 'settings', label: 'Alert Preferences', icon: Settings },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={cn(
                "px-4 py-3 font-mono uppercase tracking-widest border-b-2 flex items-center gap-2 transition-colors",
                activeSubTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeSubTab === 'create' && (
          <form onSubmit={handleCreateWatchlist} className="space-y-6 max-w-2xl bg-surface p-6 border border-outline/30">
            <div>
              <label className="block text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">Watchlist Name</label>
              <input
                type="text"
                required
                value={newWatchlist.name}
                onChange={e => setNewWatchlist({ ...newWatchlist, name: e.target.value })}
                className="w-full bg-surface-container border border-outline/50 px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-on-surface font-sans"
                placeholder="e.g., Handy Grain Black Sea"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">Target Item Type</label>
                <select
                  value={newWatchlist.type}
                  onChange={e => setNewWatchlist({ ...newWatchlist, type: e.target.value })}
                  className="w-full bg-surface-container border border-outline/50 px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-on-surface font-mono"
                >
                  <option value="cargo">Looking for Cargo</option>
                  <option value="tonnage">Looking for Tonnage</option>
                  <option value="urgent">Urgent Deals Only</option>
                  <option value="route">Route Focused</option>
                  <option value="commodity">Commodity Focused</option>
                </select>
              </div>
              
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-2">Visibility</label>
                <select
                  value={newWatchlist.visibility}
                  onChange={e => setNewWatchlist({ ...newWatchlist, visibility: e.target.value as any })}
                  className="w-full bg-surface-container border border-outline/50 px-4 py-2 text-sm focus:outline-none focus:border-primary transition-colors text-on-surface font-mono"
                >
                  <option value="private">Private (Only Me)</option>
                  <option value="my_desk">My Desk (Shared with Org)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-outline/30">
               <h4 className="text-[10px] font-bold text-on-surface uppercase tracking-widest mb-4">Required Criteria</h4>
               
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1">Commodity / Keywords</label>
                    <input
                      type="text"
                      value={newWatchlist.filters?.commodity || ''}
                      onChange={e => setNewWatchlist({ ...newWatchlist, filters: { ...newWatchlist.filters, commodity: e.target.value }})}
                      className="w-full bg-surface-container border border-outline/50 px-3 py-1.5 text-xs text-on-surface focus:border-primary"
                      placeholder="e.g., Grain, Wheat"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1">Preferred Vessel Type</label>
                    <input
                      type="text"
                      value={newWatchlist.filters?.vesselType || ''}
                      onChange={e => setNewWatchlist({ ...newWatchlist, filters: { ...newWatchlist.filters, vesselType: e.target.value }})}
                      className="w-full bg-surface-container border border-outline/50 px-3 py-1.5 text-xs text-on-surface focus:border-primary"
                      placeholder="e.g., Handysize"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1">Load Area / Port</label>
                    <input
                      type="text"
                      value={newWatchlist.filters?.loadArea || ''}
                      onChange={e => setNewWatchlist({ ...newWatchlist, filters: { ...newWatchlist.filters, loadArea: e.target.value }})}
                      className="w-full bg-surface-container border border-outline/50 px-3 py-1.5 text-xs text-on-surface focus:border-primary"
                      placeholder="e.g., Black Sea"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-on-surface-variant mb-1">Discharge Area / Port</label>
                    <input
                      type="text"
                      value={newWatchlist.filters?.dischargeArea || ''}
                      onChange={e => setNewWatchlist({ ...newWatchlist, filters: { ...newWatchlist.filters, dischargeArea: e.target.value }})}
                      className="w-full bg-surface-container border border-outline/50 px-3 py-1.5 text-xs text-on-surface focus:border-primary"
                      placeholder="e.g., Continent"
                    />
                  </div>
               </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="px-6 py-3 bg-primary text-on-primary text-[10px] uppercase tracking-widest font-bold hover:bg-primary/90 flex items-center gap-2"
              >
                <Plus className="w-3 h-3" /> Create Watchlist
              </button>
            </div>
          </form>
        )}

        {activeSubTab === 'watchlists' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
               <div className="p-8 text-center text-sm text-on-surface-variant animate-pulse">Loading watchlists...</div>
            ) : watchlists.length === 0 ? (
               <div className="col-span-full p-8 border border-outline/30 bg-surface text-center">
                  <Radar className="w-12 h-12 text-on-surface-variant mx-auto mb-4 opacity-50" />
                  <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest mb-2">No Active Watchlists</h3>
                  <p className="text-xs text-on-surface-variant max-w-sm mx-auto mb-6">Create a watchlist to let the Radar engine automatically find deals that match your criteria.</p>
                  <button onClick={() => setActiveSubTab('create')} className="px-6 py-2 border border-primary text-primary text-[10px] uppercase font-bold hover:bg-primary/10">Create First Watchlist</button>
               </div>
            ) : (
               watchlists.map(wl => (
                 <div key={wl.id} className="bg-surface border border-outline/30 p-5 flex flex-col hover:border-primary/50 transition-colors cursor-default group relative">
                    <div className="flex justify-between items-start mb-4">
                       <h4 className="text-sm font-bold text-on-surface uppercase pr-6">{wl.name}</h4>
                       <span className={cn("text-[9px] px-2 py-0.5 rounded-sm font-mono uppercase tracking-widest", wl.status === 'active' ? "bg-primary/20 text-primary" : "bg-outline text-on-surface")}>{wl.status}</span>
                    </div>
                    <div className="text-xs text-on-surface-variant mb-4 flex-1">
                      <div className="grid grid-cols-2 gap-y-2">
                        {Object.entries(wl.filters || {}).map(([key, val]) => val ? (
                           <div key={key}>
                             <span className="block text-[8px] uppercase tracking-widest opacity-60">{key}</span>
                             <span className="font-mono text-[10px] text-on-surface truncate pr-2 block">{val as string}</span>
                           </div>
                        ) : null)}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-outline/20">
                       <span className="text-[10px] flex items-center gap-1 text-on-surface-variant tracking-widest"><ShieldCheck className="w-3 h-3" /> {wl.visibility === 'private' ? 'Private' : 'Desk'}</span>
                       <button onClick={async () => {
                          const conf = window.confirm("Archive watchlist?");
                          if (conf) {
                             await deleteDoc(doc(db, 'watchlists', wl.id));
                          }
                       }} className="text-[10px] text-error hover:underline uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Archive</button>
                    </div>
                 </div>
               ))
            )}
          </div>
        )}

        {activeSubTab === 'matches' && (
           <MatchEngineView watchlists={watchlists} />
        )}
        
        {activeSubTab === 'settings' && (
           <div className="max-w-2xl bg-surface p-6 border border-outline/30 space-y-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline/30 pb-4">Alert Preferences</h3>
              
              <div className="flex items-center justify-between p-4 border border-outline/20 bg-surface-container">
                 <div>
                    <h4 className="text-[12px] font-bold text-on-surface uppercase mb-1">In-App Live Alerts</h4>
                    <p className="text-[10px] text-on-surface-variant">Show immediate notifications when a strong match is detected.</p>
                 </div>
                 <div className="w-10 h-5 bg-primary rounded-full relative shadow-[inset_0_0_5px_rgba(0,0,0,0.5)]">
                   <div className="w-4 h-4 bg-black rounded-full absolute right-0.5 top-0.5" />
                 </div>
              </div>
              
              <div className="flex items-center justify-between p-4 border border-outline/20 bg-surface-container opacity-50">
                 <div>
                    <h4 className="text-[12px] font-bold text-on-surface uppercase mb-1">Daily Email Digest</h4>
                    <p className="text-[10px] text-on-surface-variant">Receive a daily summary of all watchlist matches.</p>
                 </div>
                 <div className="text-[10px] font-mono text-tertiary">COMING SOON</div>
              </div>

              <div className="flex items-center justify-between p-4 border border-outline/20 bg-surface-container opacity-50">
                 <div>
                    <h4 className="text-[12px] font-bold text-on-surface uppercase mb-1">Urgent Deals Only</h4>
                    <p className="text-[10px] text-on-surface-variant">Send SMS or Telegram alerts for urgent high-score matches.</p>
                 </div>
                 <div className="text-[10px] font-mono text-tertiary">COMING SOON</div>
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

const MatchEngineView = ({ watchlists }: { watchlists: Watchlist[] }) => {
   const { user } = useAuth();
   const [matches, setMatches] = useState<any[]>([]);
   const [dismissed, setDismissed] = useState<Set<string>>(new Set());
   const [saved, setSaved] = useState<Set<string>>(new Set());
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      if (!user) return;

      let cancelled = false;

      const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
      const includesTerm = (value: unknown, term: unknown) => {
        const needle = normalize(term);
        return !needle || normalize(value).includes(needle);
      };

      const scoreSharedItem = (watchlist: Watchlist, item: any) => {
        if (watchlist.status !== 'active') return null;
        const filters = watchlist.filters || {};
        const reasons: string[] = [];
        let score = 55;

        const wantsCargo = watchlist.type === 'cargo' || watchlist.type === 'route' || watchlist.type === 'commodity';
        const wantsVessel = watchlist.type === 'tonnage';
        if (wantsCargo && item.itemType !== 'cargo') return null;
        if (wantsVessel && item.itemType !== 'vessel') return null;
        if (watchlist.type === 'urgent' && !item.isUrgent) return null;

        if (filters.commodity) {
          if (item.itemType !== 'cargo' || !includesTerm(item.commodity, filters.commodity)) return null;
          reasons.push(`Commodity: ${item.commodity}`);
          score += 12;
        }
        if (filters.vesselType) {
          if (item.itemType !== 'vessel' || !includesTerm(item.vessel_type || item.type, filters.vesselType)) return null;
          reasons.push(`Vessel type: ${item.vessel_type || item.type}`);
          score += 12;
        }
        if (filters.loadArea) {
          if (item.itemType !== 'cargo' || !includesTerm(item.loadPort, filters.loadArea)) return null;
          reasons.push(`Load area: ${item.loadPort}`);
          score += 10;
        }
        if (filters.dischargeArea) {
          if (item.itemType !== 'cargo' || !includesTerm(item.dischargePort, filters.dischargeArea)) return null;
          reasons.push(`Discharge area: ${item.dischargePort}`);
          score += 10;
        }
        if (item.isUrgent) {
          reasons.push('Marked urgent by source desk');
          score += 8;
        }

        const hasAnyFilter = Boolean(filters.commodity || filters.vesselType || filters.loadArea || filters.dischargeArea || watchlist.type === 'urgent');
        if (!hasAnyFilter) return null;

        return {
          score: Math.min(100, score),
          reasons: reasons.length ? reasons : ['Watchlist criteria matched']
        };
      };

      const fetchMatches = async () => {
         setLoading(true);
         try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const connectedTo = Array.isArray(userSnap.data()?.connectedTo)
              ? userSnap.data()!.connectedTo.filter((id: unknown) => typeof id === 'string' && id)
              : [];

            const sharedItems: any[] = [];
            for (const ownerId of connectedTo) {
              const sharedQuery = query(
                collection(db, 'sharedItems'),
                where('ownerId', '==', ownerId),
                where('status', '==', 'active')
              );
              const sharedSnap = await getDocs(sharedQuery);
              sharedSnap.forEach(d => sharedItems.push({ id: d.id, ...d.data() }));
            }

            const activeWatchlists = watchlists.filter(w => w.status === 'active');
            for (const watchlist of activeWatchlists) {
              for (const item of sharedItems) {
                const scored = scoreSharedItem(watchlist, item);
                if (!scored) continue;

                const matchId = `${watchlist.id}__${item.id}`;
                const isCargo = item.itemType === 'cargo';
                const title = isCargo
                  ? `${item.quantity || ''} ${item.commodity || 'Cargo'}`.trim()
                  : `${item.name || item.vessel_name || 'Vessel'} ${item.dwt ? `(${Number(item.dwt).toLocaleString()} DWT)` : ''}`.trim();

                await setDoc(doc(db, 'watchlistMatches', matchId), {
                  id: matchId,
                  watchlistId: watchlist.id,
                  createdByUid: user.uid,
                  sourceItemId: item.id,
                  sourceOwnerId: item.ownerId,
                  matchedItemType: item.itemType,
                  source: 'Desk Network',
                  score: scored.score,
                  label: scored.score >= 90 ? 'excellent' : scored.score >= 75 ? 'good' : 'candidate',
                  reasons: scored.reasons,
                  suggestedActions: ['View', 'Save', 'Dismiss'],
                  itemDetails: {
                    title,
                    route: isCargo ? `${item.loadPort || 'TBD'} - ${item.dischargePort || 'TBD'}` : item.openPort || 'TBD',
                    laycan: isCargo ? item.laycan || 'TBD' : item.openDate || 'TBD'
                  },
                  updatedAt: serverTimestamp()
                }, { merge: true });
              }
            }

            const matchesQuery = query(collection(db, 'watchlistMatches'), where('createdByUid', '==', user.uid));
            const snap = await getDocs(matchesQuery);
            const loadedMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!cancelled) setMatches(loadedMatches);
         } catch (err) {
            console.error('Smart Radar scan failed', err);
            if (!cancelled) setMatches([]);
         } finally {
            if (!cancelled) setLoading(false);
         }
      };
      
      fetchMatches();
      return () => { cancelled = true; };
   }, [user, watchlists]);

   const handleAction = async (id: string, action: string) => {
      if (!user) return;
      if (action === 'Dismiss') {
         setDismissed(prev => new Set(prev).add(id));
         await updateDoc(doc(db, 'watchlistMatches', id), {
            status: 'dismissed',
            dismissedBy: user.uid,
            audit: arrayUnion({ action: 'dismissed', timestamp: new Date().toISOString() })
         });
      }
      if (action === 'Save') {
         setSaved(prev => new Set(prev).add(id));
         await updateDoc(doc(db, 'watchlistMatches', id), {
            status: 'saved',
            savedBy: user.uid,
            audit: arrayUnion({ action: 'saved', timestamp: new Date().toISOString() })
         });

         const m = matches.find(x => x.id === id);
         if (m) {
            import('../lib/alertService').then(({ createAlert }) => {
               createAlert({
                  recipientUid: user.uid,
                  title: 'Smart Radar Match Saved',
                  message: `You saved match "${m.itemDetails?.title || id}".`,
                  priority: 'info',
                  category: 'smart_radar_match',
                  actionRoute: '/radar'
               }).catch(console.error);
            });
         }
      }
   };

   const activeMatches = matches.filter(m => !dismissed.has(m.id) && m.status !== 'dismissed');

   return (
      <div className="space-y-6">
         {watchlists.length === 0 ? (
            <div className="p-8 border border-outline/30 bg-surface/50 text-center">
               <h3 className="text-sm font-bold text-on-surface-variant uppercase">Radar Idle</h3>
               <p className="text-[10px] text-on-surface-variant max-w-sm mx-auto mt-2">Create a Watchlist to activate Smart Radar tracking.</p>
            </div>
         ) : loading ? (
            <div className="p-8 text-center text-sm text-on-surface-variant animate-pulse">Scanning network...</div>
         ) : activeMatches.length === 0 ? (
            <div className="p-8 border border-outline/30 bg-surface/50 flex flex-col items-center">
               <CheckSquare className="w-8 h-8 text-primary mb-4 opacity-70" />
               <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">All Caught Up</h3>
               <p className="text-[10px] text-on-surface-variant max-w-sm mx-auto mt-2 text-center">We will notify you when new opportunities match your active watchlists.</p>
            </div>
         ) : (
            <>
            <div className="mb-4">
              <OpportunityMap items={activeMatches.map(m => ({ id: m.id, name: m.itemDetails?.title || 'Match', visibility: 'private', ...(m.itemDetails?.route ? { loadPort: m.itemDetails.route.split('-')[0], dischargePort: m.itemDetails.route.split('-')[1] } : {}) }))} itemType="mixed" />
            </div>
            <div className="grid grid-cols-1 gap-4">
               {activeMatches.map(m => (
                  <div key={m.id} className="bg-surface border border-outline/30 p-5 flex flex-col md:flex-row gap-6 relative group overflow-hidden">
                     {/* Score Banner */}
                     {m.score >= 90 && (
                       <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none transform translate-x-8 -translate-y-8 rotate-45 bg-primary/20" />
                     )}
                     
                     <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                           <div className={cn(
                              "text-xl font-display font-light flex items-center justify-center w-12 h-12 rounded-sm",
                              m.score >= 90 ? "bg-primary text-black" : "bg-surface-container text-on-surface"
                           )}>
                              {m.score}
                           </div>
                           <div>
                              <div className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant">{m.source}</div>
                              <div className="text-base font-bold text-on-surface">{m.itemDetails?.title || 'Matched Opportunity'}</div>
                           </div>
                        </div>
                        <div className="text-xs font-mono text-on-surface-variant mb-4 pl-[60px]">
                           {m.itemDetails?.route} • {m.itemDetails?.laycan}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                           {m.reasons.map((r: string, i: number) => (
                              <span key={i} className="text-[9px] px-2 py-1 bg-surface-container border border-outline/50 text-on-surface uppercase font-mono">{r}</span>
                           ))}
                        </div>

                        {m.proximity && (
                           <div className="mb-4 bg-tertiary/5 border border-tertiary/20 p-3 rounded-sm flex items-start gap-3">
                              <MapPin className="w-4 h-4 text-tertiary shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                 <h4 className="text-[10px] text-tertiary font-bold uppercase tracking-widest flex items-center gap-2">
                                    Proximity & Laycan
                                    <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded-sm">{m.proximity.proximityScore > 0 ? 'Scored' : 'Unknown'}</span>
                                 </h4>
                                 <p className="text-xs text-on-surface">{m.proximity.explanation}</p>
                                 <div className="flex gap-4 text-[10px] text-on-surface-variant font-mono">
                                    <span>Dist Conf: {m.proximity.distanceConfidence}</span>
                                    {m.proximity.positionSourceConfidence !== 'unknown' && <span>AIS Conf: {m.proximity.positionSourceConfidence}</span>}
                                 </div>
                              </div>
                           </div>
                        )}

                        <div className="mt-2 pr-4 space-y-4">
                           <CounterpartyLinker itemId={m.id} itemType="radarMatch" />
                           <VoyageEstimateSection itemId={m.id} itemType="smart_radar" />
                           <AIDealBriefCard itemId={m.id} itemType="radarMatch" dealType="Smart Match" />
                        </div>
                     </div>
                     
                     <div className="flex flex-row md:flex-col justify-end gap-2 shrink-0 md:w-32 border-t md:border-t-0 md:border-l border-outline/20 pt-4 md:pt-0 md:pl-6">
                        <button onClick={async () => {
                          const { createDealRoom } = await import('../lib/dealRoomService');
                          await createDealRoom({
                             title: `Match: ${m.itemDetails?.title || 'Opportunity'}`,
                             status: 'draft',
                             createdByUid: user.uid,
                             linkedSmartRadarMatchId: m.id,
                             source: 'Smart Radar Match'
                          });
                          alert('Deal Room Created! Navigate to Deal Rooms tab to view.');
                        }} className="flex-1 py-2 bg-text text-surface font-bold text-[10px] uppercase tracking-widest hover:bg-on-surface/90 transition-colors">
                           Deal Room
                        </button>
                        {!saved.has(m.id) && m.status !== 'saved' && (
                           <button onClick={() => handleAction(m.id, 'Save')} className="flex-1 py-2 bg-surface text-on-surface border border-outline/50 font-bold text-[10px] uppercase tracking-widest hover:border-primary transition-colors">
                              Save
                           </button>
                        )}
                        <button onClick={() => handleAction(m.id, 'Dismiss')} className="flex-1 py-2 bg-surface text-error border border-error/20 font-bold text-[10px] uppercase tracking-widest hover:bg-error/10 hover:border-error transition-colors">
                           Dismiss
                        </button>
                     </div>
                  </div>
               ))}
            </div>
            </>
         )}
      </div>
   );
};
