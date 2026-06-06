import React, { useState, useEffect } from 'react';
import { Cargo, Vessel, INITIAL_VESSELS, MatchResult, cn } from '../lib/utils';
import { matchVessels } from '../lib/geminiService';
import { ShieldCheck, Zap, Ship, MapPin, Gauge, Edit3, MessageSquare, RotateCw, ArrowRight, AlertTriangle, Calculator } from 'lucide-react';
import { motion } from 'motion/react';
import { useNotification } from '../lib/NotificationContext';

export const MatchingEngine: React.FC<{ 
  activeCargo: Cargo; 
  vesselList: Vessel[]; 
  onBack: () => void;
  onAssign?: (vesselId: string, eta: string) => void;
}> = ({ activeCargo, vesselList, onBack, onAssign }) => {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [assumptions, setAssumptions] = useState({
    bunkerPrice: 600,
    dailyHire: 10000,
    portCost: 30000,
    canalCost: 0,
    ballastSpeed: 13,
    ladenSpeed: 12.5,
    ballastConsumption: 25,
    ladenConsumption: 28,
    idleConsumption: 3,
    waitingDays: 2
  });
  const { notify, addNotification, settings } = useNotification();

  const runMatching = async () => {
    setLoading(true);
    if (!vesselList || vesselList.length === 0) {
      setMatches([]);
      setLoading(false);
      return;
    }
    try {
      const results = await matchVessels(activeCargo, vesselList, assumptions);
      setMatches(results);

      const strongMatches = results.filter(r => r.score >= (settings?.strongMatchThreshold || 80));
      if (strongMatches.length > 0) {
        // Prevent spam by checking if we already notified for this cargo maybe? We'll just emit it.
        const title = settings?.mode === 'broker_humor'
          ? "⚡ Strong match found — this one deserves broker attention."
          : `Strong Match Detected for ${activeCargo.commodity}`;
        addNotification({
          title,
          message: `Found ${strongMatches.length} highly viable vessel(s) for the active cargo.`,
          severity: 'success',
          entityType: 'match',
          entityId: activeCargo.id,
          source: 'matching_engine'
        });
      }

    } catch (err: any) {
      notify({
        title: 'Matching Failed',
        message: err.message || 'An error occurred during AI matching',
        type: 'error'
      });
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runMatching();
  }, [activeCargo, vesselList, notify]);

  return (
    <div className="flex-1 flex flex-col bg-surface h-full overflow-hidden">
      <div className="p-4 border-b border-outline bg-surface-container flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-primary font-bold font-sans text-[10px] font-semibold tracking-[0.15em] uppercase hover:underline text-[12px]">
            &lt; RETURN_TO_MATRIX
          </button>
          <div className="h-4 w-px bg-[#2d3f5a]"></div>
          <h2 className="font-display text-[14px] text-on-surface uppercase tracking-widest flex items-center gap-2 font-bold">
            <div className="w-2 h-2 bg-primary animate-pulse"></div>
            MATCHING ENGINE_CORE
          </h2>
        </div>
        <div className="hidden sm:block text-[10px] font-mono text-tertiary font-bold">ST_SYNC_COMPLETE</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20 no-scrollbar">
        <section className="border border-outline bg-surface-container-high p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-5">
            <Zap className="h-32 w-32" />
          </div>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b border-outline">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-on-surface-variant uppercase tracking-[0.2em] font-bold text-[10px]">CURRENT_TARGET_PACKET</span>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-4">
              <h1 className="font-display text-[32px] font-bold text-on-surface leading-none tracking-tighter uppercase whitespace-pre-wrap">{activeCargo.commodity} /{activeCargo.quantity}</h1>
               <div className="flex items-center gap-4 text-on-surface-variant font-mono text-[11px] uppercase font-bold">
                <span className="text-on-surface underline decoration-[#1d9bf0]">{activeCargo.loadPort}</span>
                <ArrowRight className="h-4 w-4 text-primary" />
                <span className="text-on-surface underline decoration-[#1d9bf0]">{activeCargo.dischargePort}</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest border border-outline p-4 flex flex-col items-end shrink-0 justify-center">
              <span className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-[10px] text-on-surface-variant mb-1 font-bold">LAYCAN_WINDOW</span>
              <span className="font-mono text-primary font-bold text-lg">{activeCargo.laycan}</span>
            </div>
          </div>
        </section>

        <div className="bg-surface-container-lowest border border-outline p-3 font-mono text-[10px] text-tertiary/80 space-y-1">
          <div className="flex gap-4">
            <span className="text-[#2d3f5a]">&gt;&gt; [14:40:01]</span>
            <span>INTEL_SCAN: FETCHING AIS TELEMETRY... [OK]</span>
          </div>
          <div className="flex gap-4">
            <span className="text-[#2d3f5a]">&gt;&gt; [14:40:02]</span>
            <span>FILTER: APPLYING LAYCAN_TOLERANCE (±2.5d)... [OK]</span>
          </div>
          <div className="flex gap-4">
            <span className="text-[#2d3f5a]">&gt;&gt; [14:40:03]</span>
            <span className="animate-pulse">COMPUTING: MATCH_PROBABILITY_MATRIX...</span>
          </div>
          {!loading && (
             <div className="pt-2 text-tertiary font-bold uppercase">
               &gt;&gt; ANALYSIS COMPLETE. {matches.length} VALID CANDIDATES IDENTIFIED.
             </div>
          )}
        </div>

        {!loading && (
          <div className="border border-outline bg-surface-container p-4">
            <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowAssumptions(!showAssumptions)}>
              <div className="flex items-center gap-2 font-bold uppercase text-[12px] tracking-widest text-primary">
                <Calculator className="h-4 w-4" /> Market Assumptions (Estimated)
              </div>
              <button className="text-[10px] text-on-surface-variant uppercase hover:text-on-surface">
                {showAssumptions ? 'Hide Settings' : 'Edit Settings'}
              </button>
            </div>
            
            {showAssumptions ? (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Bunker Price ($/mt)</label>
                  <input type="number" value={assumptions.bunkerPrice} onChange={e => setAssumptions({...assumptions, bunkerPrice: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Daily Hire ($/day)</label>
                  <input type="number" value={assumptions.dailyHire} onChange={e => setAssumptions({...assumptions, dailyHire: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Ballast Spd (kn)</label>
                  <input type="number" value={assumptions.ballastSpeed} onChange={e => setAssumptions({...assumptions, ballastSpeed: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Laden Spd (kn)</label>
                  <input type="number" value={assumptions.ladenSpeed} onChange={e => setAssumptions({...assumptions, ladenSpeed: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Wait (Days)</label>
                  <input type="number" value={assumptions.waitingDays} onChange={e => setAssumptions({...assumptions, waitingDays: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Ballast Cons. (mt)</label>
                  <input type="number" value={assumptions.ballastConsumption} onChange={e => setAssumptions({...assumptions, ballastConsumption: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Laden Cons. (mt)</label>
                  <input type="number" value={assumptions.ladenConsumption} onChange={e => setAssumptions({...assumptions, ladenConsumption: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Idle Cons. (mt)</label>
                  <input type="number" value={assumptions.idleConsumption} onChange={e => setAssumptions({...assumptions, idleConsumption: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Port Cost ($)</label>
                  <input type="number" value={assumptions.portCost} onChange={e => setAssumptions({...assumptions, portCost: Number(e.target.value)})} className="w-full bg-surface border border-outline px-2 py-1 text-[12px] text-on-surface" />
                </div>
                <div className="flex items-end">
                  <button onClick={runMatching} className="w-full h-[26px] bg-primary/20 text-primary border border-primary/50 text-[10px] uppercase font-bold hover:bg-primary/30 transition-colors">
                    Recalculate
                  </button>
                </div>
              </div>
            ) : (
               <div className="mt-2 text-[10px] text-on-surface-variant italic font-mono space-y-1">
                 <div>Estimated based on saved/default assumptions — not live market data.</div>
                 <div className="flex gap-4">
                   <span>Bunker: ${assumptions.bunkerPrice}/mt</span>
                   <span>Hire: ${assumptions.dailyHire}/day</span>
                   <span>Spd_B/L: {assumptions.ballastSpeed}/{assumptions.ladenSpeed}kn</span>
                   <span>Ports: ${assumptions.portCost}</span>
                 </div>
               </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-2 border-primary/20 border-t-[#1d9bf0] animate-spin"></div>
            <p className="font-mono text-[11px] text-on-surface/80 uppercase tracking-[0.4em] text-[10px] text-on-surface-variant animate-pulse">Running spatial analysis vectors...</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
             <Ship className="w-12 h-12 text-on-surface-variant opacity-50 mb-4" />
             <p className="font-display text-[16px] uppercase tracking-widest text-on-surface">NO_MATCHES_FOUND</p>
             <p className="font-mono text-[11px] text-on-surface-variant max-w-md mt-2">
               Either your vessel database is empty or no vessels match this cargo's requirements. 
               Please add vessels via the Vessel Registry or wait for incoming messages.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {matches.map((match, idx) => {
              const vessel = vesselList.find(v => v.id === match.vesselId);
              const hasLowScore = match.positionFit < 50 || match.commercialViability < 50;
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={match.vesselId}
                  className="border border-outline bg-surface-container-high hover:border-primary transition-all flex flex-col relative group"
                >
                  <div className="p-4 border-b border-outline flex items-center justify-between bg-surface-container">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 border border-primary/30 flex items-center justify-center">
                        <Ship className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-on-surface uppercase tracking-widest text-[14px]">{vessel?.name}</h3>
                        <div className="text-[9px] text-on-surface-variant font-bold">{vessel?.type} / {vessel?.dwt?.toLocaleString() || 'N/A'} MT</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-[24px] font-black font-display text-tertiary tracking-tighter leading-none">{match.score}%</div>
                      <span className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-[8px] text-on-surface-variant font-bold">MATCH_INDEX</span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 border-b border-outline pb-4">
                      <div className="text-center">
                        <div className="text-[14px] font-bold text-on-surface">{match.technicalFit || 0}%</div>
                        <div className="text-[8px] uppercase tracking-widest font-mono text-on-surface-variant">Tech. Fit</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-[14px] font-bold ${match.positionFit < 50 ? 'text-error' : 'text-on-surface'}`}>{match.positionFit || 0}%</div>
                        <div className="text-[8px] uppercase tracking-widest font-mono text-on-surface-variant">Pos. Fit</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[14px] font-bold text-on-surface">{match.laycanFit || 0}%</div>
                        <div className="text-[8px] uppercase tracking-widest font-mono text-on-surface-variant">Laycan Fit</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-[14px] font-bold ${match.commercialViability < 50 ? 'text-red-400' : 'text-on-surface'}`}>{match.commercialViability || 0}%</div>
                        <div className="text-[8px] uppercase tracking-widest font-mono text-on-surface-variant">Comm. Fit</div>
                      </div>
                    </div>

                    {hasLowScore && (
                      <div className="bg-red-900/10 border border-red-500/20 p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-red-400 font-bold text-[10px] uppercase font-sans tracking-widest">
                          <AlertTriangle className="h-3 w-3" />
                          Technical fit only. Commercial repositioning cost may make this uneconomical.
                        </div>
                        {match.calculatorOutputs && (
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-1">
                            <div><span className="text-red-400/70">Loss Before Load:</span> <span className="text-error font-bold">${match.calculatorOutputs.ownerLossBeforeLoading?.toLocaleString() || 0}</span></div>
                            <div><span className="text-red-400/70">Ballast Dist:</span> <span className="text-red-300">{match.calculatorOutputs.ballastDistance || 0} NM</span></div>
                            <div className="col-span-2 text-[9px] text-red-400/50">Recommendation: {match.calculatorOutputs.recommendation}</div>
                          </div>
                        )}
                        {match.missingCommercialData && (
                          <div className="text-[9px] font-mono text-on-surface-variant italic mt-1">
                            * Commercial data missing or estimated.
                          </div>
                        )}
                      </div>
                    )}

                    {!hasLowScore && match.calculatorOutputs && (
                      <div className="bg-green-900/10 border border-green-500/20 p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-tertiary font-bold text-[10px] uppercase font-sans tracking-widest">
                          <Calculator className="h-3 w-3" />
                          Commercial Estimate
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-1">
                          <div><span className="text-tertiary/70">Loss Before Load:</span> <span className="text-tertiary font-bold">${match.calculatorOutputs.ownerLossBeforeLoading?.toLocaleString() || 0}</span></div>
                          <div><span className="text-tertiary/70">Ballast Dist:</span> <span className="text-tertiary">{match.calculatorOutputs.ballastDistance || 0} NM</span></div>
                          <div className="col-span-2 text-[9px] text-tertiary/70">Recommendation: {match.calculatorOutputs.recommendation}</div>
                        </div>
                        {match.missingCommercialData && (
                          <div className="text-[9px] font-mono text-on-surface-variant italic mt-1">
                            * Commercial data missing or estimated.
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-outline pt-4">
                      {match.reasoning.map((reason, ridx) => (
                        <div key={ridx} className="flex gap-2 items-start font-mono text-[11px] text-on-surface/80 text-on-surface-variant text-[9px] uppercase font-bold">
                          <div className="w-1 h-1 bg-tertiary mt-1 shrink-0"></div>
                          {reason}
                        </div>
                      ))}
                    </div>

                    <div className="bg-surface-container-lowest p-3 border border-outline space-y-2 mt-auto">
                       <div className="flex justify-between items-center text-[11px] font-mono">
                         <span className="text-on-surface-variant uppercase font-bold">ETA_WINDOW:</span>
                         <span className="text-on-surface font-bold">{match.eta}</span>
                       </div>
                       <div className="flex justify-between items-center text-[11px] font-mono">
                         <span className="text-on-surface-variant uppercase font-bold">SPATIAL_GAP:</span>
                         <span className="text-primary font-bold">{match.distance}</span>
                       </div>
                    </div>
                  </div>

                  <div className="p-2 bg-surface-container grid grid-cols-2 gap-2 border-t border-outline">
                    <button 
                      onClick={() => onAssign && onAssign(match.vesselId, match.eta)}
                      className="h-10 bg-primary text-on-primary font-bold font-sans text-[10px] tracking-[0.15em] uppercase hover:opacity-90 transition-all text-[11px]"
                    >
                      PROCESS OFFER
                    </button>
                    <button className="h-10 border border-outline text-on-surface font-bold font-sans text-[10px] tracking-[0.15em] uppercase hover:bg-surface-container-high transition-all text-[11px]">
                      DIRECT_LINK
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

