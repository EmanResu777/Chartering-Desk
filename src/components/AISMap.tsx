import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Vessel } from '../lib/utils';
import { Ship } from 'lucide-react';

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
  hoveredVesselId?: string | null
}> = ({ vessels, onSelectVessel, hoveredVesselId }) => {
  const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY;
  const [positions, setPositions] = useState<Record<string, {lat: number, lon: number, heading?: number}>>({});

  const hoveredVesselCenter = useMemo(() => {
    if (!hoveredVesselId) return undefined;
    const vessel = vessels.find(v => v.id === hoveredVesselId);
    if (vessel && vessel.mmsi && positions[vessel.mmsi]) {
      return [positions[vessel.mmsi].lat, positions[vessel.mmsi].lon] as [number, number];
    }
    return undefined;
  }, [hoveredVesselId, vessels, positions]);
  
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
    let fallbackInterval: any;
    
    const monitoredMmsis = vessels.map(v => v.mmsi).filter(Boolean) as string[];
    
    // Initialize starting positions immediately
    const initialPositions: Record<string, any> = {};
    vessels.forEach((v, index) => {
      if (v.mmsi) {
         // Generate deterministic semi-random positions so they dont clump
         initialPositions[v.mmsi] = {
           lat: 30 + (index % 5) * 5,
           lon: -40 + (index % 6) * 5,
           heading: (index * 45) % 360
         };
      }
    });
    setPositions(initialPositions);
    
    if (apiKey && monitoredMmsis.length > 0) {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      ws.onopen = function () {
        const subscriptionMessage = {
          Apikey: apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FiltersShipMMSI: monitoredMmsis,
          FilterMessageTypes: ["PositionReport"]
        };
        ws?.send(JSON.stringify(subscriptionMessage));
      };
      
      ws.onmessage = function (event) {
        try {
          const aisMessage = JSON.parse(event.data);
          if (aisMessage.MessageType === "PositionReport") {
            const mmsi = String(aisMessage.MetaData.MMSI);
            // Only update if it's one of our monitored ships
            if (monitoredMmsis.includes(mmsi)) {
              const pos = aisMessage.Message.PositionReport;
              setPositions(prev => ({
                ...prev,
                [mmsi]: {
                  lat: pos.Latitude,
                  lon: pos.Longitude,
                  heading: pos.TrueHeading
                }
              }));
            }
          }
        } catch (e) {}
      };
    } else {
      // Simulate live data if no API key
      fallbackInterval = setInterval(() => {
        setPositions(prev => {
          const next = { ...prev };
          vessels.forEach(v => {
            if (v.mmsi && next[v.mmsi]) {
               next[v.mmsi] = {
                 lat: next[v.mmsi].lat + (Math.random() - 0.5) * 0.1,
                 lon: next[v.mmsi].lon + (Math.random() - 0.5) * 0.1,
               }
            }
          });
          return next;
        });
      }, 2000);
    }

    return () => {
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [apiKey, vessels]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer center={savedCenter} zoom={savedZoom} style={{ height: '100%', width: '100%' }} className="z-0 bg-surface-container-low" scrollWheelZoom={true}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapPersister />
        <MapController hoveredVesselCenter={hoveredVesselCenter} />
        {vessels.filter(v => v.mmsi && positions[v.mmsi]).map(vessel => (
          <Marker 
            key={vessel.id} 
            position={[positions[vessel.mmsi!].lat, positions[vessel.mmsi!].lon]} 
            icon={createShipIcon(positions[vessel.mmsi!].heading)}
          >
            <Popup className="custom-popup">
              <div 
                className="text-[10px] font-sans p-2 cursor-pointer hover:bg-surface-container-low transition-colors rounded-sm"
                onClick={() => onSelectVessel(vessel)}
              >
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-outline/30">
                  <p className="font-bold text-primary text-sm tracking-tight">{vessel.name}</p>
                  <span className="text-[9px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm">{vessel.type}</span>
                </div>
                
                <div className="space-y-1.5 font-mono text-[10px]">
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">DWT:</span>
                    <span className="text-on-surface">{vessel.dwt?.toLocaleString() || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">Status:</span>
                    <span className="text-on-surface">{vessel.status}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-on-surface-variant">Open Port:</span>
                    <span className="text-on-surface truncate max-w-[100px] text-right" title={vessel.openPort}>{vessel.openPort}</span>
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
    </div>
  );
};
