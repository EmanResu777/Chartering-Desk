import React, { useState, useEffect } from 'react';
import { Map, MapPin, Navigation, Info, AlertTriangle, Ship, Package2 } from 'lucide-react';
import { useConfig } from '../lib/ConfigContext';
import { Cargo, Vessel } from '../lib/utils';
import { haversineDistance, getProximityLabel } from '../lib/locationIntelligence';
import { cn } from '../lib/utils';

interface MapProps {
  items: any[];
  itemType?: 'mixed' | 'cargo' | 'vessel' | 'marketRequest' | 'hotOpp';
}

export function OpportunityMap({ items, itemType = 'mixed' }: MapProps) {
  const { t } = useConfig();
  const [filterType, setFilterType] = useState('all');
  const [filterVis, setFilterVis] = useState('all');

  useEffect(() => {
    if (items.length > 0) {
      import('../lib/proximityIntelligence').then(({ logProximityAudit }) => {
        logProximityAudit('proximity_viewed', {
          sourceModule: 'opportunity_map'
        });
      });
    }
  }, [items.length]);

  const visibleItems = items.filter(item => {
    if (filterType !== 'all') {
      const type = item.commodity ? 'cargo' : item.dwt ? 'vessel' : 'other';
      if (type !== filterType) return false;
    }
    if (filterVis !== 'all' && item.visibility && item.visibility !== filterVis) return false;
    return true;
  });

  return (
    <div className="bg-surface border border-outline rounded-xl flex flex-col h-[500px] overflow-hidden">
      <div className="p-4 border-b border-outline bg-surface-container flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Map className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium font-display">Commercial Map</h3>
        </div>
        <div className="flex space-x-2 text-xs">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-background border border-outline rounded p-1">
            <option value="all">All Types</option>
            <option value="cargo">Cargoes</option>
            <option value="vessel">Tonnage</option>
          </select>
          <select value={filterVis} onChange={e => setFilterVis(e.target.value)} className="bg-background border border-outline rounded p-1">
            <option value="all">All Visibility</option>
            <option value="private">Private</option>
            <option value="desk_network">Network</option>
          </select>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-background relative">
         <div className="absolute inset-0 bg-secondary/10 opacity-30 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(var(--color-primary-rgb), 0.1) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
         
         <div className="flex-1 p-8 flex flex-col items-center justify-center text-center relative z-10 border-r border-outline border-dashed">
            <div className="bg-surface-container-low border border-outline p-6 rounded-2xl shadow-xl max-w-sm mb-6 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2 opacity-10">
                  <Navigation className="w-24 h-24" />
               </div>
               <MapPin className="w-8 h-8 text-primary mx-auto mb-3" />
               <h4 className="font-display text-lg text-on-surface">Map View Placeholder</h4>
               <p className="text-sm text-on-surface-variant mt-2">
                 Map markers are processed safely. Live interactive map integration is pending.
               </p>
               <div className="mt-4 flex items-center justify-center space-x-1 text-[10px] uppercase font-bold text-primary bg-primary/10 tracking-wider py-1 px-3 rounded-full w-fit mx-auto">
                 <AlertTriangle className="w-3 h-3 mr-1" />
                 No Live Default AIS Allowed
               </div>
            </div>
            <p className="text-xs text-on-surface-variant max-w-md">
              Approximate distance logic is applied via location model. Distances are calculated point-to-point via haversine formula without routing engine guarantees.
            </p>
         </div>

         <div className="w-full md:w-80 bg-surface flex flex-col border-l border-outline">
            <div className="p-3 border-b border-outline bg-surface-container-low font-medium text-xs uppercase tracking-wider text-on-surface-variant">
              Regional Proximity ({visibleItems.length})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
               {visibleItems.length === 0 ? (
                 <div className="text-center p-4 text-xs text-on-surface-variant italic">No items found with current filters</div>
               ) : visibleItems.map((item, i) => (
                 <div key={item.id || i} className="p-3 bg-background border border-outline rounded-lg text-sm hover:border-primary/50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-1 font-medium font-display text-primary truncate pr-2">
                         {item.commodity ? <Package2 className="w-3.5 h-3.5"/> : <Ship className="w-3.5 h-3.5"/>}
                         <span className="truncate">{item.commodity ? item.commodity : item.name || 'Open Tonnage'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                         {!item.commodity && item.positionSource && item.positionSource !== 'system' && (
                           <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 flex items-center gap-1", 
                             item.aisStale ? 'bg-warning/10 text-warning' : 'bg-tertiary/10 text-tertiary'
                           )}>
                             {!item.aisStale && <span className="w-1 h-1 rounded-full bg-tertiary animate-pulse" />}
                             {item.aisStale ? 'Stale' : 'AIS'}
                           </span>
                         )}
                         <span className={cn("text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm shrink-0", 
                           item.visibility === 'private' ? 'bg-secondary/20 text-on-surface-variant' : 'bg-primary/10 text-primary'
                         )}>
                           {item.visibility || 'private'}
                         </span>
                      </div>
                    </div>
                    <div className="flex items-center text-xs text-on-surface-variant space-x-1 mt-1.5">
                       <MapPin className="w-3 h-3 shrink-0" />
                       <span className="truncate">
                         {item.commodity 
                           ? `${item.loadLocation?.portName || item.loadPort} → ${item.dischargeLocation?.portName || item.dischargePort}`
                           : `${item.openingLocation?.portName || item.openPort}`
                         }
                       </span>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </div>
    </div>
  );
}
