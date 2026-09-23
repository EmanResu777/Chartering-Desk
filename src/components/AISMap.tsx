import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Vessel } from '../lib/utils';
import { Ship, Info, ExternalLink, RefreshCw } from 'lucide-react';
import { auth } from '../lib/firebase';

const createShipIcon = (heading?: number) => {
  const rotation = heading || 0;
  return L.divIcon({
    html: `<div class="w-8 h-8 bg-primary/20 border border-primary rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(var(--color-primary),0.5)]">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary" style="transform: rotate(${rotation}deg); transition: transform 0.3s ease;">
        <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 3.2-1.2 5-2 1.2-.5 2.1-.5 3 0 1.7.8 2.5 2 5 2 1.3 0 1.9-.5 2.5-1"/>
        <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
        <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
        <path d="M12 10v4"/>
        <path d="M12 2v3"/>
      </svg>
    </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const MapPersister = () => {
  const map = useMapEvents({
    moveend: () => {
      const center = map.getCenter();
      localStorage.setItem('ais_map_center', JSON.stringify({ lat: center.lat, lng: center.lng }));
    },
    zoomend: () => {
      localStorage.setItem('ais_map_zoom', map.getZoom().toString());
    }
  });
  return null;
};

const MapController: React.FC<{ hoveredVesselCenter?: [number, number] }> = ({ hoveredVesselCenter }) => {
  const map = useMapEvents({});
  useEffect(() => {
    if (hoveredVesselCenter) {
      map.flyTo(hoveredVesselCenter, 10, { animate: true, duration: 1.5 });
    }
  }, [hoveredVesselCenter, map]);
  return null;
};

export const AISMap: React.FC<{ 
  vessels: Vessel[], 
  onSelectVessel: (v: Vessel) => void,
  hoveredVesselId?: string | null,
  selectedVessel?: Vessel | null
}> = ({ vessels, onSelectVessel, hoveredVesselId, selectedVessel }) => {
  const [positions, setPositions] = useState<Record<string, {lat: number, lon: number, heading?: number, source?: string, timestamp?: string, status?: string}>>({});
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const targetVesselCenter = useMemo(() => {
    const targetId = selectedVessel ? selectedVessel.id : hoveredVesselId;
    if (!targetId) return undefined;
    const vessel = vessels.find(v => v.id === targetId);
    if (vessel && vessel.mmsi && positions[vessel.mmsi]) {
      return [positions[vessel.mmsi].lat, positions[vessel.mmsi].lon] as [number, number];
    }
    return undefined;
  }, [hoveredVesselId, selectedVessel, vessels, positions]);
  
  const savedCenter = (() => {
    try {
      const item = localStorage.getItem('ais_map_center');
      if (item) {
        const parsed = JSON.parse(item);
        if (parsed.lat && parsed.lng) return [parsed.lat, parsed.lng] as [number, number];
      }
    } catch (e) {}
    return [35, -20] as [number, number];
  })();

  const savedZoom = (() => {
    try {
      const item = localStorage.getItem('ais_map_zoom');
      if (item) return parseInt(item, 10);
    } catch (e) {}
    return 3;
  })();

  useEffect(() => {
    let ws: WebSocket | null = null;
    
    const monitoredMmsis = vessels.map(v => v.mmsi).filter(Boolean) as string[];

    if (selectedVessel) {
      if (!selectedVessel.mmsi && !selectedVessel.imo) {
        setBackendError("MMSI missing — live AIS lookup cannot be requested.");
        setIsLoading(false);
      } else if (!selectedVessel.mmsi) {
        setBackendError("MMSI missing — live AIS lookup cannot be requested.");
        setIsLoading(false);
      } else {
        setBackendError(null);
        setIsLoading(true);
        const fetchPos = async () => {
          try {
            const user = auth.currentUser;
            if (!user) {
              setBackendError("Unauthorized: Please log in.");
              setIsLoading(false);
              return;
            }
            const token = await user.getIdToken();
            const res = await fetch('/api/ais/vessel-position', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                vesselId: selectedVessel.id,
                imo: selectedVessel.imo,
                mmsi: selectedVessel.mmsi
              })
            });
            const data = await res.json();
            
            if (res.ok && data.isLive && data.latitude != null && data.longitude != null) {
               setPositions(prev => ({
                 ...prev,
                 [selectedVessel.mmsi!]: { 
                   lat: data.latitude, 
                   lon: data.longitude, 
                   heading: data.heading ?? undefined, 
                   source: data.provider || 'AIS provider',
                   timestamp: data.positionReceivedAt || new Date().toISOString(),
                   status: 'live' 
                 }
               }));
               setBackendError(null);
            } else if (selectedVessel.latitude != null && selectedVessel.longitude != null) {
               setPositions(prev => ({
                 ...prev,
                 [selectedVessel.mmsi!]: { 
                   lat: selectedVessel.latitude!, 
                   lon: selectedVessel.longitude!, 
                   source: selectedVessel.positionSource || 'Stored Internal',
                   timestamp: selectedVessel.positionReceivedAt || selectedVessel.positionUpdatedAt || selectedVessel.updatedAt || new Date().toISOString(),
                   status: 'stored'
                 }
               }));
               setBackendError(data.sanitizedPreview || data.message || null);
            } else {
               setBackendError(data.sanitizedPreview || data.message || data.error || `No AIS position returned for MMSI ${selectedVessel.mmsi}`);
            }
          } catch(e: any) {
             if (selectedVessel.latitude != null && selectedVessel.longitude != null) {
               setPositions(prev => ({
                 ...prev,
                 [selectedVessel.mmsi!]: { 
                   lat: selectedVessel.latitude!, 
                   lon: selectedVessel.longitude!, 
                   source: selectedVessel.positionSource || 'Stored Internal',
                   timestamp: selectedVessel.positionReceivedAt || selectedVessel.positionUpdatedAt || selectedVessel.updatedAt || new Date().toISOString(),
                   status: 'stored'
                 }
               }));
               setBackendError('Live AIS unavailable; showing stored position.');
             } else {
               setBackendError(`AIS provider error: ${e.message}`);
             }
          } finally {
             setIsLoading(false);
          }
        };
        fetchPos();
      }
    } else {
      setBackendError(null);
    }
    
    // We only use the backend proxy for AIS lookups as per security policy (do not expose AISStream API key in frontend)
    // If future iteration provides a safe token for the client, websocket can be restored.
    
    return () => {
    };
  }, [vessels, selectedVessel]);

  return (
    <div className="w-full h-full relative z-0 flex flex-col bg-surface-container-low">
      <div className="flex-1 relative">
        <MapContainer center={savedCenter} zoom={savedZoom} style={{ height: '100%', width: '100%' }} className="z-0 bg-surface-container-low" scrollWheelZoom={true}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapPersister />
          <MapController hoveredVesselCenter={targetVesselCenter} />
          {vessels.filter(v => v.mmsi && positions[v.mmsi]).map(vessel => (
            <Marker 
              key={vessel.id} 
              position={[positions[vessel.mmsi!].lat, positions[vessel.mmsi!].lon]} 
              icon={createShipIcon(positions[vessel.mmsi!].heading)}
            >
              <Popup className="custom-popup">
                <div 
                  className="text-[10px] font-sans p-2 cursor-pointer hover:bg-surface-container-low transition-colors rounded-sm min-w-[200px]"
                  onClick={() => onSelectVessel(vessel)}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-outline/30">
                    <p className="font-bold text-primary text-sm tracking-tight">{vessel.name}</p>
                    <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{vessel.type}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3">
                    {positions[vessel.mmsi!]?.status === 'live' ? (
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live AIS
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span>
                        Stored position
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1.5 font-mono text-[10px]">
                    <div className="flex justify-between gap-4">
                      <span className="text-on-surface-variant">Source:</span>
                      <span className="text-on-surface truncate max-w-[100px] text-right" title={positions[vessel.mmsi!]?.source}>{positions[vessel.mmsi!]?.source || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-on-surface-variant">Updated:</span>
                      <span className="text-on-surface text-right">
                        {positions[vessel.mmsi!]?.timestamp ? (() => {
                           const date = new Date(positions[vessel.mmsi!].timestamp!);
                           const diffMins = Math.round((Date.now() - date.getTime()) / 60000);
                           if (diffMins < 60) return `${diffMins}m ago`;
                           if (diffMins < 1440) return `${Math.round(diffMins/60)}h ago`;
                           return `${Math.round(diffMins/1440)}d ago`;
                        })() : 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 pt-2 border-t border-outline/20">
                      <span className="text-on-surface-variant">DWT:</span>
                      <span className="text-on-surface">{vessel.dwt?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-on-surface-variant">Status:</span>
                      <span className="text-on-surface">{vessel.status}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-center text-[9px] text-tertiary uppercase tracking-widest font-bold border-t border-outline/20 pt-2">
                    Click for Full Details
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Empty States overlaying the map */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6 z-[400] bg-surface-container-low/40 backdrop-blur-[2px]">
          {!selectedVessel ? (
            <div className="bg-surface-container border border-outline/30 rounded-sm p-6 max-w-sm w-full text-center shadow-xl pointer-events-auto backdrop-blur-md">
              <Ship className="h-8 w-8 text-on-surface-variant mx-auto mb-3 opacity-50" />
              <h3 className="text-sm font-display text-on-surface mb-2">No Vessel Selected</h3>
              <p className="text-[11px] text-on-surface-variant font-sans tracking-wide">Select a vessel to view AIS position.</p>
            </div>
          ) : (!selectedVessel.mmsi || !positions[selectedVessel.mmsi]) ? (
            <div className="bg-surface-container border border-outline/30 rounded-sm p-6 max-w-sm w-full text-center shadow-xl pointer-events-auto backdrop-blur-md">
              <Info className="h-8 w-8 text-on-surface-variant mx-auto mb-3 opacity-50" />
              <h3 className="text-sm font-display text-on-surface mb-2">AIS Position Unavailable</h3>
              
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-4">
                  <RefreshCw className="h-5 w-5 text-primary animate-spin mb-2" />
                  <p className="text-[11px] text-on-surface-variant font-sans tracking-wide">Fetching live coordinates...</p>
                </div>
              ) : backendError ? (
                <p className="text-[11px] text-error font-sans mb-4 tracking-wide">{backendError}</p>
              ) : (
                <p className="text-[11px] text-on-surface-variant font-sans mb-4 tracking-wide">AIS position unavailable for this vessel. Waiting for live tracking data or MMSI missing.</p>
              )}
              
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const { name, imo, mmsi } = selectedVessel;
                  if (imo || mmsi) {
                    let detailPath = imo ? `imo:${imo}` : `mmsi:${mmsi}`;
                    const nameSlug = name ? `/vessel:${encodeURIComponent(name.toUpperCase().replace(/\s+/g, '_'))}` : '';
                    window.open(`https://www.marinetraffic.com/en/ais/details/ships/${detailPath}${nameSlug}`, '_blank');
                  } else {
                    const query = encodeURIComponent(name.trim());
                    window.open(`https://www.marinetraffic.com/en/ais/index/search/all/keyword:${query}`, '_blank');
                  }
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-transparent border border-outline/50 hover:border-primary/50 text-on-surface-variant hover:text-primary transition-colors rounded-sm text-[10px] uppercase font-bold tracking-widest"
              >
                Open External AIS
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="absolute top-4 right-4 bg-surface-container border border-outline/30 p-4 rounded-sm shadow-xl pointer-events-auto backdrop-blur-md w-64 max-w-[calc(100vw-2rem)]">
               <div className="flex items-center justify-between mb-2">
                 <p className="font-bold text-primary tracking-tight font-sans truncate">{selectedVessel.name}</p>
                 <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{selectedVessel.type}</span>
               </div>
               
               <div className="flex items-center gap-2 mb-3 pb-2 border-b border-outline/20">
                 {positions[selectedVessel.mmsi]?.status === 'live' ? (
                   <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                     Live AIS
                   </span>
                 ) : (
                   <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                     <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span>
                     Stored position · Not live AIS
                   </span>
                 )}
               </div>

               <div className="space-y-1.5 font-mono text-[10px]">
                 <div className="flex justify-between gap-4">
                   <span className="text-on-surface-variant">Source:</span>
                   <span className="text-on-surface truncate text-right max-w-[120px]" title={positions[selectedVessel.mmsi]?.source}>{positions[selectedVessel.mmsi]?.source || 'Unknown'}</span>
                 </div>
                 {positions[selectedVessel.mmsi]?.status === 'live' && (
                 <div className="flex justify-between gap-4">
                   <span className="text-on-surface-variant">MMSI:</span>
                   <span className="text-on-surface">{selectedVessel.mmsi}</span>
                 </div>
                 )}
                 <div className="flex justify-between gap-4">
                   <span className="text-on-surface-variant">Updated:</span>
                   <span className="text-on-surface text-right">
                     {positions[selectedVessel.mmsi]?.timestamp ? (() => {
                        const date = new Date(positions[selectedVessel.mmsi!].timestamp!);
                        const now = new Date();
                        const diffMins = Math.round((now.getTime() - date.getTime()) / 60000);
                        if (diffMins < 60) return `${diffMins} min ago`;
                        if (diffMins < 1440) return `${Math.round(diffMins/60)} hr ago`;
                        return `${Math.round(diffMins/1440)} days ago`;
                     })() : 'Unknown'}
                   </span>
                 </div>
                 <div className="flex justify-between gap-4 pt-2 border-t border-outline/20">
                   <span className="text-on-surface-variant">Lat/Lon:</span>
                   <span className="text-on-surface">{positions[selectedVessel.mmsi]?.lat.toFixed(4)}, {positions[selectedVessel.mmsi]?.lon.toFixed(4)}</span>
                 </div>
                 <div className="flex justify-between gap-4">
                   <span className="text-on-surface-variant">DWT:</span>
                   <span className="text-on-surface">{selectedVessel.dwt?.toLocaleString() || 'N/A'}</span>
                 </div>
                 <div className="flex justify-between gap-4">
                   <span className="text-on-surface-variant">Status:</span>
                   <span className="text-on-surface">{selectedVessel.status}</span>
                 </div>
                 
                 <div className="flex justify-between gap-4 pt-2 border-t border-outline/20 mt-2">
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       const { name, imo, mmsi } = selectedVessel;
                       if (imo || mmsi) {
                         let detailPath = imo ? `imo:${imo}` : `mmsi:${mmsi}`;
                         const nameSlug = name ? `/vessel:${encodeURIComponent(name.toUpperCase().replace(/\s+/g, '_'))}` : '';
                         window.open(`https://www.marinetraffic.com/en/ais/details/ships/${detailPath}${nameSlug}`, '_blank');
                       } else {
                         const query = encodeURIComponent(name.trim());
                         window.open(`https://www.marinetraffic.com/en/ais/index/search/all/keyword:${query}`, '_blank');
                       }
                     }}
                     className="w-full flex items-center justify-center gap-2 py-2 text-on-surface-variant hover:text-primary transition-colors text-[9px] uppercase font-bold tracking-widest"
                   >
                     External AIS <ExternalLink className="h-3 w-3" />
                   </button>
                 </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

