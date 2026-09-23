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
  const [selectedMapItem, setSelectedMapItem] = useState<any | null>(null);

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

  const getCoordinates = (item: any): { latitude: number; longitude: number; source: string } | null => {
    const candidates = [
      { latitude: item.latitude, longitude: item.longitude, source: item.positionSource || 'position' },
      { latitude: item.openingLocation?.latitude, longitude: item.openingLocation?.longitude, source: item.openingLocation?.positionSource || 'opening' },
      { latitude: item.loadLocation?.latitude, longitude: item.loadLocation?.longitude, source: item.loadLocation?.positionSource || 'load' },
      { latitude: item.geography?.vesselOpeningLocation?.latitude, longitude: item.geography?.vesselOpeningLocation?.longitude, source: 'deal-vessel' },
      { latitude: item.geography?.cargoLoadLocation?.latitude, longitude: item.geography?.cargoLoadLocation?.longitude, source: 'deal-cargo' }
    ];

    for (const candidate of candidates) {
      const latitude = Number(candidate.latitude);
      const longitude = Number(candidate.longitude);
      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 && latitude <= 90 &&
        longitude >= -180 && longitude <= 180
      ) {
        return { latitude, longitude, source: candidate.source };
      }
    }
    return null;
  };

  const positionedItems = visibleItems
    .map(item => ({ item, coordinates: getCoordinates(item) }))
    .filter((entry): entry is { item: any; coordinates: { latitude: number; longitude: number; source: string } } => Boolean(entry.coordinates));

  const mapPoint = (latitude: number, longitude: number) => ({
    x: ((longitude + 180) / 360) * 100,
    y: ((90 - latitude) / 180) * 100
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
         
         <div className="flex-1 p-3 sm:p-5 relative z-10 border-r border-outline border-dashed min-h-[300px]">
            <div className="h-full min-h-[280px] bg-surface-container-low border border-outline rounded-xl overflow-hidden relative">
               <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-2">
                 <span className="text-[9px] uppercase tracking-widest font-bold bg-surface/90 border border-outline px-2 py-1 text-on-surface">
                   Geographic Position Plot
                 </span>
                 <span className="text-[9px] uppercase tracking-widest bg-surface/90 border border-outline px-2 py-1 text-on-surface-variant">
                   {positionedItems.length}/{visibleItems.length} geocoded
                 </span>
               </div>

               <svg viewBox="0 0 1000 500" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-label="Geographic position plot">
                 <rect x="0" y="0" width="1000" height="500" fill="transparent" />
                 {[125, 250, 375, 500, 625, 750, 875].map(x => (
                   <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="500" stroke="currentColor" className="text-outline/20" strokeWidth="1" />
                 ))}
                 {[83, 166, 250, 333, 416].map(y => (
                   <line key={`h-${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="currentColor" className="text-outline/20" strokeWidth="1" />
                 ))}
                 <line x1="500" y1="0" x2="500" y2="500" stroke="currentColor" className="text-outline/40" strokeWidth="1.5" />
                 <line x1="0" y1="250" x2="1000" y2="250" stroke="currentColor" className="text-outline/40" strokeWidth="1.5" />

                 {positionedItems.map(({ item, coordinates }, index) => {
                   const point = mapPoint(coordinates.latitude, coordinates.longitude);
                   const x = point.x * 10;
                   const y = point.y * 5;
                   const isCargo = Boolean(item.commodity);
                   const selected = selectedMapItem === item;
                   return (
                     <g
                       key={item.id || index}
                       role="button"
                       tabIndex={0}
                       onClick={() => setSelectedMapItem(item)}
                       onKeyDown={(event) => {
                         if (event.key === 'Enter' || event.key === ' ') setSelectedMapItem(item);
                       }}
                       className="cursor-pointer"
                     >
                       <circle
                         cx={x}
                         cy={y}
                         r={selected ? 10 : 7}
                         fill="currentColor"
                         className={isCargo ? "text-primary" : "text-tertiary"}
                         opacity={selected ? 1 : 0.85}
                       />
                       <circle cx={x} cy={y} r={selected ? 18 : 13} fill="none" stroke="currentColor" className={isCargo ? "text-primary/50" : "text-tertiary/50"} strokeWidth="2" />
                     </g>
                   );
                 })}
               </svg>

               {positionedItems.length === 0 && (
                 <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                   <div className="max-w-sm">
                     <MapPin className="w-8 h-8 text-on-surface-variant mx-auto mb-3" />
                     <h4 className="font-display text-base text-on-surface">No geocoded positions available</h4>
                     <p className="text-xs text-on-surface-variant mt-2">
                       Add verified coordinates, stored port coordinates, or a live AIS position. The desk will not invent map positions.
                     </p>
                   </div>
                 </div>
               )}

               <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 pointer-events-none">
                 <div className="bg-surface/90 border border-outline px-2 py-1 text-[8px] uppercase tracking-widest text-on-surface-variant">
                   Equirectangular commercial position plot · not for navigation
                 </div>
                 {selectedMapItem && (() => {
                   const c = getCoordinates(selectedMapItem);
                   return c ? (
                     <div className="bg-surface/95 border border-primary/40 px-3 py-2 text-right pointer-events-auto max-w-[240px]">
                       <div className="text-[10px] font-bold text-on-surface truncate">
                         {selectedMapItem.commodity || selectedMapItem.name || 'Selected item'}
                       </div>
                       <div className="mt-1 text-[9px] font-mono text-on-surface-variant">
                         {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)} · {c.source}
                       </div>
                     </div>
                   ) : null;
                 })()}
               </div>
            </div>
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
