import React, { useState, useEffect } from 'react';
import { useAuth, db } from '../../lib/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { MarketRequest, MarketRequestType } from '../../lib/utils';
import { Search, Ship, Package2 } from 'lucide-react';
import { MarketRequestsForm } from './MarketRequestsForm';

import { AIDealBriefCard } from '../AIDealBriefCard';
import { CounterpartyLinker } from '../CounterpartyLinker';
import { VoyageEstimateSection } from '../VoyageEstimateSection';
import { OpportunityMap } from '../OpportunityMap';
import { MapPin, Database } from 'lucide-react';

interface MarketRequestsTabProps {
  type: 'search_requests' | 'available_vessels';
}

export const MarketRequestsTab: React.FC<MarketRequestsTabProps> = ({ type }) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<MarketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<MarketRequestType | null>(null);

  const [viewMode, setViewMode] = useState<'list'|'map'>('list');

  const handleCloseRequest = async (id: string) => {
    if (!user) return;
    if (confirm('Are you sure you want to close this market request?')) {
      try {
        const { updateDoc, doc, arrayUnion } = await import('firebase/firestore');
        await updateDoc(doc(db, 'marketRequests', id), {
          status: 'closed',
          audit: arrayUnion({ action: 'request closed', timestamp: new Date().toISOString(), actor: user.uid })
        });
      } catch (err: any) {
        alert("Error closing request: " + err.message);
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    
    // We fetch ACTIVE listings. 
    // If it's 'search_requests', we show cargo_search and tonnage_search.
    // If 'available_vessels', we show available_vessel.
    const q = query(
      collection(db, 'marketRequests'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: MarketRequest[] = [];
      snap.forEach(d => {
        data.push({ id: d.id, ...d.data() } as MarketRequest);
      });
      
      const filtered = data.filter(req => {
        // Enforce basic visibility rules on client (already enforced by rules, but let's be strict).
        if (req.visibility === 'private' && req.createdByUid !== user.uid) return false;
        
        // Lazy expiration check
        if (req.expiryAt && new Date(req.expiryAt).getTime() < Date.now() && req.status === 'active') {
          import('firebase/firestore').then(({updateDoc, doc, arrayUnion}) => {
            updateDoc(doc(db, 'marketRequests', req.id), {
              status: 'expired',
              audit_2: arrayUnion({ action: 'expired', timestamp: new Date().toISOString(), actor: 'system' })
            }).catch(console.warn);
          });
          return false;
        }

        if (type === 'search_requests') {
          return req.type === 'cargo_search' || req.type === 'tonnage_search';
        } else {
          return req.type === 'available_vessel';
        }
      });
      setRequests(filtered);
      setLoading(false);
    }, (err) => {
      console.warn("Market requests error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user, type]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-surface-container p-4 border border-outline/30 rounded-sm">
        <div>
          <h3 className="font-medium text-sm text-on-surface">
            {type === 'search_requests' ? 'Search Requests' : 'Available Tonnage'}
          </h3>
          <p className="text-xs text-on-surface-variant">
            {type === 'search_requests' ? 'Market participants looking for cargo or tonnage.' : 'Open vessels advertised for charter.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
              onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
              className="btn-outline px-3 h-8 text-xs flex items-center gap-2"
            >
              {viewMode === 'list' ? <MapPin className="w-4 h-4" /> : <Database className="w-4 h-4" />}
              {viewMode === 'list' ? "Map" : "List"}
          </button>
          {type === 'search_requests' ? (
            <>
              <button 
                onClick={() => setShowForm('cargo_search')}
                className="btn-primary text-xs flex items-center gap-2"
              >
                <Package2 className="w-4 h-4" />
                Find Cargo
              </button>
              <button 
                onClick={() => setShowForm('tonnage_search')}
                className="btn-outline text-xs flex items-center gap-2"
              >
                <Ship className="w-4 h-4" />
                Find Tonnage
              </button>
            </>
          ) : (
            <button 
              onClick={() => setShowForm('available_vessel')}
              className="btn-primary text-xs flex items-center gap-2"
            >
              <Ship className="w-4 h-4" />
              Add Open Tonnage
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-on-surface-variant animate-pulse">Loading market data...</div>
      ) : requests.length === 0 ? (
        <div className="p-8 text-center text-xs text-on-surface-variant border border-outline/20 bg-surface-container-low border-dashed">
          No active {type === 'search_requests' ? 'requests' : 'listings'} found in your network.
        </div>
      ) : viewMode === 'map' ? (
        <OpportunityMap items={requests.map(r => ({ ...r, commodity: r.cargoType, name: r.vesselName || 'Tonnage', visibility: r.visibility || 'network' }))} itemType="mixed" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map(req => (
            <div key={req.id} className="p-4 border border-outline bg-surface-container-lowest rounded-sm shadow-sm flex flex-col gap-3 group relative overflow-hidden">
               <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    {req.type === 'cargo_search' ? <Package2 className="w-4 h-4 text-primary" /> : <Ship className="w-4 h-4 text-tertiary" />}
                    <span className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">
                       {req.type.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant">{new Date(req.createdAt).toLocaleDateString()}</span>
               </div>
               
               <div className="space-y-1 mt-1">
                 {req.type === 'cargo_search' && (
                   <>
                     <div className="font-medium text-sm">{req.cargoType || 'Any Cargo'}</div>
                     <div className="text-xs text-on-surface-variant flex items-center gap-4">
                        <span>{req.quantityMin && req.quantityMax ? `${req.quantityMin} - ${req.quantityMax} MT` : (req.quantityMin ? `>= ${req.quantityMin} MT` : 'Quantity open')}</span>
                     </div>
                     <div className="text-xs text-on-surface-variant">
                        Route: {req.loadArea || 'Any'} &rarr; {req.dischargeArea || 'Any'}
                     </div>
                     {(req.dateFrom || req.dateTo) && (
                        <div className="text-xs text-on-surface-variant">Dates: {req.dateFrom} to {req.dateTo}</div>
                     )}
                   </>
                 )}
                 {req.type === 'tonnage_search' && (
                   <>
                     <div className="font-medium text-sm">Looking for {req.vesselType || 'Any vessel'}</div>
                     <div className="text-xs text-on-surface-variant">Open Area: {req.loadArea || req.dischargeArea || 'Any'}</div>
                     {(req.dateFrom || req.dateTo) && (
                        <div className="text-xs text-on-surface-variant">Dates: {req.dateFrom} to {req.dateTo}</div>
                     )}
                     <div className="text-xs text-on-surface-variant">Cargo: {req.cargoType || 'Any'}</div>
                   </>
                 )}
                 {req.type === 'available_vessel' && (
                   <>
                     <div className="font-medium text-sm">{req.vesselType} {req.vesselName ? `- ${req.vesselName}` : ''}</div>
                     <div className="text-xs text-on-surface-variant">{req.dwtMin ? `${req.dwtMin} DWT` : ''} {req.yearBuilt ? `(Built ${req.yearBuilt})` : ''}</div>
                     <div className="text-xs text-on-surface-variant">Open: {req.loadArea || 'Any'} • {req.dateFrom || 'Prompt'}</div>
                     {req.remarks && <div className="text-xs text-on-surface-variant mt-2 border-t border-outline/20 pt-2">{req.remarks}</div>}
                   </>
                 )}
               </div>

               <div className="mt-2 space-y-4">
                  <CounterpartyLinker itemId={req.id} itemType="marketRequest" />
                  <VoyageEstimateSection itemId={req.id} itemType="market_request" />
                  <AIDealBriefCard itemId={req.id} itemType="marketRequest" dealType={req.type} />
               </div>

               {req.createdByUid !== user.uid && (
                 <div className="pt-3 mt-auto border-t border-outline/10 flex justify-end gap-2">
                    <button onClick={async () => {
                      const { createDealRoom } = await import('../../lib/dealRoomService');
                      await createDealRoom({
                         title: `Match: Market ${req.type.replace('_',' ')}`,
                         status: 'draft',
                         createdByUid: user.uid,
                         linkedMarketRequestId: req.id,
                         source: 'Market Request'
                      });
                      alert('Deal Room Created! Navigate to Deal Rooms tab to view.');
                    }} className="px-4 py-2 bg-primary text-black font-bold uppercase tracking-widest text-[9px] hover:bg-primary/90 rounded-sm">
                      Open Deal Room
                    </button>
                 </div>
               )}
               {req.createdByUid === user.uid && (
                 <div className="pt-3 mt-auto border-t border-outline/10 flex justify-end gap-2 items-center">
                    <span className="text-[10px] text-primary bg-primary/10 px-2 py-1 rounded-sm uppercase tracking-wider font-bold">Your listing</span>
                    <button 
                      onClick={() => handleCloseRequest(req.id)}
                      className="text-[10px] text-error hover:bg-error/10 px-2 py-1 uppercase tracking-wider font-bold rounded-sm ml-auto"
                    >
                      Close
                    </button>
                 </div>
               )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <MarketRequestsForm 
          type={showForm} 
          onClose={() => setShowForm(null)} 
        />
      )}
    </div>
  );
};
