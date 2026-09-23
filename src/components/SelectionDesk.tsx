import React, { useState, useEffect } from 'react';
import { Ship, Package2, ArrowRight, Zap, Loader2, Info, TrendingUp, DollarSign, Fuel, Map, Navigation as NavIcon, Calendar } from 'lucide-react';
import { Cargo, Vessel, INITIAL_CARGO, INITIAL_VESSELS, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentEditor } from './DocumentEditor';
import { useNotification } from '../lib/NotificationContext';
import { useConfig } from '../lib/ConfigContext';
import { auth } from '../lib/firebase';

interface VoyageCalculation {
  ballastLeg: string;
  ladenLeg: string;
  distanceToLoad: string;
  distanceVoyage: string;
  totalDistance: string;
  distanceStatus: string;
  
  seaDays: string;
  portDays: string;
  waitingDays: string;
  daysTotal: string;
  speedStatus: string;

  fuelConsumption: string;
  totalBunkerQuantity: string;
  fuelCost: string;
  consumptionStatus: string;
  bunkerPriceStatus: string;

  portCosts: string;
  pdaStatus: string;
  totalExpenses: string;
  
  cargoQuantityStatus: string;
  estimatedFreight: string;
  freightStatus: string;
  
  profitability: string;
  tce: string;
  reasoning: string;
  commercialStatus: string;
  completenessScore: number;
  
  routeIntegrity: string;
  routeConfidence: string;
  ballastSeverity: string;
  commercialRecommendation: string;
  dwtUtilizationWarning: string | null;
}

export const SelectionDesk: React.FC<{
  cargoes: Cargo[];
  vessels: Vessel[];
  selectedCargo: Cargo | null;
  setSelectedCargo: React.Dispatch<React.SetStateAction<Cargo | null>>;
  selectedVessel: Vessel | null;
  setSelectedVessel: React.Dispatch<React.SetStateAction<Vessel | null>>;
}> = ({ cargoes, vessels, selectedCargo, setSelectedCargo, selectedVessel, setSelectedVessel }) => {
  const { notify } = useNotification();
  const { t } = useConfig();
  const [calculation, setCalculation] = useState<VoyageCalculation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<'RECAP' | 'GENCON' | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'cargo' | 'intelligence' | 'vessel'>('intelligence');

  const [overrides, setOverrides] = useState<any>({});

  const calculateVoyage = async (cargo: Cargo, vessel: Vessel, currentOverrides = overrides) => {
    setIsLoading(true);
    setError(null);
    setCalculation(null);
    setActiveMobileTab('intelligence');

    notify({
      title: 'Calculating Voyage',
      message: `Analyzing route for ${vessel.name} and ${cargo.commodity}...`,
      type: 'info'
    });

    try {
      const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
      if (!idToken) throw new Error('Authentication required');

      const resp = await fetch('/api/ai/routeTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          taskType: 'calculate_voyage',
          payload: {
            cargo,
            vessel,
            overrides: currentOverrides
          }
        })
      });

      const result = await resp.json().catch(() => ({}));

      if (resp.status === 402) {
        throw new Error(result.safeMessage || 'Credit limit reached.');
      }
      if (!resp.ok) {
        throw new Error(result.error || result.safeMessage || 'Failed to calculate voyage');
      }

      const requiredFields = ['commercialStatus', 'completenessScore', 'tce', 'estimatedFreight', 'reasoning'];
      const missingResponseFields = requiredFields.filter(field => result[field] === undefined || result[field] === null);
      if (missingResponseFields.length > 0) {
        throw new Error(`Voyage calculation response incomplete: ${missingResponseFields.join(', ')}`);
      }

      const data = result as VoyageCalculation;
      data.completenessScore = Math.max(0, Math.min(100, Number(data.completenessScore) || 0));
      setCalculation(data);

      notify({
        title: result.degraded_analysis ? 'Intelligence Ready (Fallback)' : 'Intelligence Ready',
        message: result.degraded_analysis
          ? 'Voyage scenario calculated with fallback AI. Review assumptions before use.'
          : 'Voyage calculation and TCE analysis complete.',
        type: result.degraded_analysis ? 'warning' : 'success'
      });
    } catch (err: any) {
      console.error("Calculation error:", err);
      setError(err.message || "Failed to generate voyage intelligence.");
      notify({
        title: 'Calculation Failed',
        message: err.message || 'Failed to process the voyage plan.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCargo && selectedVessel) {
      calculateVoyage(selectedCargo, selectedVessel);
    }
  }, [selectedCargo, selectedVessel]);

  const isPending = !!calculation && (
    /pending|indicative/i.test(calculation.tce || '') ||
    /pending|indicative/i.test(calculation.estimatedFreight || '') ||
    /indicative/i.test(calculation.commercialStatus || '') ||
    /missing|pending/i.test(calculation.freightStatus || '')
  );

  const isFixtureGrade = !!calculation && calculation.completenessScore >= 70 && !isPending;

  return (
    <div className="flex-1 flex flex-col h-full bg-surface relative overflow-hidden">
      <div className="absolute inset-0 bg-surface-container-lowest opacity-90 backdrop-blur-3xl z-[-1]"></div>
      
      <div className="p-3 sm:p-6 border-b border-outline/30 bg-transparent flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-6 shrink-0 relative">
        <div className="absolute inset-0 bg-surface-container-low opacity-50 backdrop-blur-3xl z-[-1]"></div>
        <div className="flex flex-col flex-1 min-w-0 w-full">
          <h2 className="font-display text-2xl sm:text-4xl text-on-surface tracking-tight font-light truncate w-full">
            {t('selection_desk')} v1.0
          </h2>
          <div className="font-mono text-[8px] sm:text-[10px] text-primary tracking-[0.3em] uppercase flex items-center gap-2 mt-1">
            <div className="w-1.5 h-1.5 bg-primary rounded-full shadow-[0_0_8px_var(--color-primary)] animate-pulse shrink-0" />
            <span className="truncate">Voyage Engine Engaged</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeDoc && selectedCargo && selectedVessel && (
          <DocumentEditor 
            type={activeDoc} 
            data={{ cargo: selectedCargo, vessel: selectedVessel, calculation: calculation || {}, overrides: overrides }} 
            onClose={() => setActiveDoc(null)} 
          />
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-4 gap-px bg-outline/20 overflow-hidden relative">
        {/* Mobile Navigation Tabs */}
        <div className="flex lg:hidden bg-surface-container border-b border-outline/20 shrink-0">
          {[
            { id: 'cargo', label: 'Cargos', icon: Package2 },
            { id: 'intelligence', label: 'Intelligence', icon: Zap },
            { id: 'vessel', label: 'Tonnage', icon: Ship }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMobileTab(tab.id as any)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-3 gap-1 relative transition-all",
                activeMobileTab === tab.id ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              <tab.icon className={cn("h-4 w-4", activeMobileTab === tab.id ? "stroke-2" : "stroke-1.5")} />
              <span className="text-[10px] font-medium uppercase tracking-widest">{tab.label}</span>
              {activeMobileTab === tab.id && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary shadow-[0_0_8px_var(--color-primary)]"
                />
              )}
            </button>
          ))}
        </div>

        {/* Left Column: Cargo Selection (25%) */}
        <div className={cn(
          "lg:col-span-1 flex flex-col bg-surface overflow-hidden relative transition-all duration-300",
          activeMobileTab !== 'cargo' && "hidden lg:flex"
        )}>
          <div className="p-4 sm:p-6 border-b border-outline/20 bg-surface-container-lowest flex items-center justify-between">
            <h3 className="text-[9px] sm:text-[10px] font-medium text-primary uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-3">
              <Package2 className="h-4 w-4 stroke-1.5" />
              Source Cargoes
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-32 sm:pb-4 space-y-3 bg-transparent">
            {cargoes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-on-surface-variant text-[10px] uppercase tracking-widest">No cargoes available</div>
            ) : cargoes.map(cargo => (
              <div 
                key={cargo.id}
                onClick={() => {
                  setSelectedCargo(cargo);
                  if (!selectedVessel) setActiveMobileTab('vessel');
                }}
                className={cn(
                  "p-4 sm:p-5 border transition-all duration-300 cursor-pointer group rounded-sm relative overflow-hidden",
                  selectedCargo?.id === cargo.id 
                    ? "bg-primary/5 border-primary/30 shadow-[inset_4px_0_0_var(--color-primary)]" 
                    : "bg-surface-container-lowest border-outline/30 hover:border-outline hover:bg-surface-container-low"
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-base sm:text-sm font-sans font-medium text-on-surface tracking-wide truncate pr-2">{cargo.commodity}</span>
                  <span className="text-[8px] sm:text-[8px] text-primary/70 font-mono tracking-widest leading-none pt-1">{cargo.id}</span>
                </div>
                <div className="space-y-2 sm:space-y-2 text-[11px] sm:text-[11px] font-sans">
                  <div className="flex items-start gap-2 text-on-surface-variant bg-surface-container-low/50 p-2 rounded-sm border border-outline/10">
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-50 mt-0.5 min-w-[14px]">L:</span>
                    <span className="text-on-surface truncate font-medium">{cargo.loadPort}</span>
                  </div>
                  <div className="flex items-start gap-2 text-on-surface-variant bg-surface-container-low/50 p-2 rounded-sm border border-outline/10">
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-50 mt-0.5 min-w-[14px]">D:</span>
                    <span className="text-on-surface truncate font-medium">{cargo.dischargePort}</span>
                  </div>
                  <div className="flex justify-between items-end mt-4 sm:mt-4 pt-4 sm:pt-4 border-t border-outline/20">
                    <span className="text-on-surface font-mono font-medium tracking-wide text-[12px] sm:text-[12px]">{cargo.quantity}</span>
                    <span className="text-tertiary text-[10px] sm:text-[10px] font-bold tracking-widest uppercase">{cargo.laycan}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Middle Column: Voyage Intelligence (50%) */}
        <div className={cn(
          "lg:col-span-2 flex flex-col bg-surface-container-lowest overflow-y-auto relative transition-all duration-300",
          activeMobileTab !== 'intelligence' && "hidden lg:flex"
        )}>
          <div className="p-6 border-b border-outline/20 bg-surface-container flex items-center justify-between shrink-0">
            <h3 className="text-[10px] font-medium text-tertiary uppercase tracking-[0.3em] flex items-center gap-3">
              <Zap className="h-4 w-4 stroke-1.5" />
              Voyage Intelligence
            </h3>
            <div className="flex gap-4">
              {(selectedCargo && selectedVessel) && (
                <div className="flex gap-3">
                   <button 
                     onClick={() => setActiveDoc('RECAP')}
                     className="text-[9px] font-bold uppercase tracking-[0.2em] bg-primary/10 border border-primary/20 text-primary p-3 sm:px-4 sm:py-2 hover:bg-primary hover:text-on-primary transition-all duration-300 rounded-sm"
                   >
                     RECAP
                   </button>
                   <button 
                     onClick={() => setActiveDoc('GENCON')}
                     className="text-[9px] font-bold uppercase tracking-[0.2em] bg-secondary/10 border border-secondary/20 text-secondary p-3 sm:px-4 sm:py-2 hover:bg-secondary hover:text-on-surface transition-all duration-300 rounded-sm"
                   >
                     GENCON
                   </button>
                </div>
              )}
              {selectedCargo && selectedVessel && !isLoading && (
                <button 
                  onClick={() => calculateVoyage(selectedCargo, selectedVessel)}
                  className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors p-3 md:p-0"
                >
                  Recalculate
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-8">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full py-12"
                >
                  <Loader2 className="h-10 w-10 text-primary animate-spin mb-6 stroke-1" />
                  <p className="text-on-surface-variant font-sans text-[11px] uppercase tracking-[0.3em] font-medium animate-pulse">Initializing Voyage Analysis</p>
                  <div className="mt-6 flex gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce delay-75" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary/80 animate-bounce delay-150" />
                  </div>
                </motion.div>
              ) : calculation ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Top KPIs */}
                  <div className="grid grid-cols-2 gap-px bg-outline/20">
                    <div className="bg-surface-container-low p-4 sm:p-8 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <DollarSign className="w-16 sm:w-24 h-16 sm:h-24 stroke-1" />
                      </div>
                      <h4 className="text-[9px] text-tertiary font-medium uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                        Fixture TCE
                      </h4>
                      <p className="text-3xl sm:text-5xl text-on-surface font-display font-light leading-none tracking-tight">{calculation.tce}</p>
                      <p className="text-[9px] text-on-surface-variant mt-4 font-mono tracking-widest uppercase truncate">
                        {isFixtureGrade ? "Above Market" : "Indicative / Pending"}
                      </p>
                    </div>
                    <div className="bg-surface-container-low p-4 sm:p-8 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                         <TrendingUp className="w-16 sm:w-24 h-16 sm:h-24 stroke-1" />
                      </div>
                      <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                        Net ROI
                      </h4>
                      <p className="text-3xl sm:text-5xl text-on-surface font-display font-light leading-none tracking-tight">{calculation.profitability}</p>
                      <p className="text-[9px] text-on-surface-variant mt-4 font-mono tracking-widest uppercase">
                        {isFixtureGrade ? "Estimated Return" : "Not fixture-grade"}
                      </p>
                    </div>
                  </div>

                  {/* Commercial Warnings */}
                  <div className={cn("bg-surface-container p-4 border rounded-sm", !isFixtureGrade ? "border-error/50" : "border-outline/20")}>
                    <h4 className={cn("text-[9px] font-medium uppercase tracking-[0.3em] mb-3", !isFixtureGrade || calculation.commercialRecommendation?.includes('Weak') ? "text-error" : "text-tertiary")}>
                      Commercial Status: {calculation.commercialStatus}
                    </h4>
                    {calculation.commercialRecommendation && (
                      <p className={cn("text-[11px] mb-2 font-medium", calculation.commercialRecommendation?.includes('Weak') ? "text-error" : "text-tertiary")}>
                        Recommendation: {calculation.commercialRecommendation}
                      </p>
                    )}
                    {calculation.dwtUtilizationWarning && (
                      <p className="text-[11px] mb-2 font-medium text-error">
                        ⚠️ {calculation.dwtUtilizationWarning}
                      </p>
                    )}
                    {!isFixtureGrade && (
                      <p className="text-[11px] text-on-surface-variant mb-2">Based on assumed economics. Do not treat as fixture-grade calculation.</p>
                    )}
                  </div>

                  {/* Manual Overrides Form */}
                  <div className="bg-surface-container-low p-4 border border-outline/20">
                    <h5 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] mb-4">Commercial Overrides</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Freight ($/mt or LS)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 35"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.freightRate || ''}
                          onChange={(e) => setOverrides({...overrides, freightRate: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Cargo MT</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 15000"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.cargoWeightMt || ''}
                          onChange={(e) => setOverrides({...overrides, cargoWeightMt: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Stowage Factor (CBM/MT)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 1.5"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.stowageFactor || ''}
                          onChange={(e) => setOverrides({...overrides, stowageFactor: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">PDA/Port ($)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 30000"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.pdaPerPort || ''}
                          onChange={(e) => setOverrides({...overrides, pdaPerPort: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Bunker ($/mt)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 650"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.vlsfoPrice || ''}
                          onChange={(e) => setOverrides({...overrides, vlsfoPrice: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Cons. (mt/day)</label>
                        <input 
                          type="number" 
                          placeholder="e.g. 21"
                          className="w-full bg-surface-container p-2 text-[11px] text-on-surface border border-outline/30 rounded-sm"
                          value={overrides.consumptionLaden || ''}
                          onChange={(e) => setOverrides({...overrides, consumptionLaden: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Distance & Fuel Summary */}
                  <div className="bg-surface-container-low border border-outline/20 flex flex-col sm:flex-row items-center justify-around text-center rounded-sm divide-y sm:divide-y-0 sm:divide-x divide-outline/20">
                    <div className="w-full sm:flex-1 py-4 sm:py-8 px-4 flex flex-col items-center">
                      <Map className="h-6 w-6 text-on-surface-variant/50 mb-3 stroke-1" />
                      <p className="text-[9px] text-on-surface-variant uppercase font-medium tracking-[0.2em] mb-2">Distance</p>
                      <p className="text-lg sm:text-xl text-on-surface font-mono font-light">{calculation.totalDistance}</p>
                      <p className="text-[9px] text-on-surface-variant mt-2 italic">{calculation.distanceStatus}</p>
                    </div>
                    <div className="w-full sm:flex-1 py-4 sm:py-8 px-4 flex flex-col items-center">
                      <Calendar className="h-6 w-6 text-tertiary/50 mb-3 stroke-1" />
                      <p className="text-[9px] text-on-surface-variant uppercase font-medium tracking-[0.2em] mb-2">Duration</p>
                      <p className="text-lg sm:text-xl text-on-surface font-mono font-light">{calculation.daysTotal}</p>
                      <div className="flex gap-3 text-[9px] text-on-surface-variant mt-2 font-mono">
                        <span>Sea: {calculation.seaDays}</span>
                        <span>Port: {calculation.portDays}</span>
                        {calculation.waitingDays && calculation.waitingDays !== '0' && calculation.waitingDays !== '0 days' && <span>Wait: {calculation.waitingDays}</span>}
                      </div>
                    </div>
                    <div className="w-full sm:flex-1 py-4 sm:py-8 px-4 flex flex-col items-center">
                      <Fuel className="h-6 w-6 text-primary/50 mb-3 stroke-1" />
                      <p className="text-[9px] text-on-surface-variant uppercase font-medium tracking-[0.2em] mb-2">Bunker</p>
                      <p className="text-sm text-on-surface font-mono font-light">{calculation.fuelConsumption}</p>
                      <p className="text-[10px] text-on-surface font-mono mt-1">Total: {calculation.totalBunkerQuantity}</p>
                      <p className="text-[9px] text-on-surface-variant mt-2 italic">{calculation.consumptionStatus}</p>
                    </div>
                  </div>

                  {/* Analysis Breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h5 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="w-6 h-[1px] bg-on-surface-variant/30"></div>
                        Voyage Economics
                      </h5>
                      <div className="space-y-4 bg-surface-container-lowest p-6 border border-outline/20 rounded-sm">
                        {[
                          { l: 'Freight Rate', v: calculation.estimatedFreight, s: calculation.freightStatus },
                          { l: 'Cargo Qty', v: selectedCargo?.quantity || 'Unknown', s: calculation.cargoQuantityStatus },
                          { l: 'Total Bunker Cost', v: calculation.fuelCost, s: calculation.bunkerPriceStatus },
                          { l: 'Port PDA', v: calculation.portCosts, s: calculation.pdaStatus },
                          { l: 'Total OPEX', v: calculation.totalExpenses, c: 'text-error font-medium', s: 'Calculated' }
                        ].map(item => (
                          <div key={item.l} className="flex justify-between items-center text-[11px] font-sans">
                            <div className="flex flex-col">
                              <span className="text-on-surface-variant tracking-wide font-light">{item.l}</span>
                              {item.s && <span className="text-[9px] text-on-surface-variant/70 italic mt-0.5">{item.s}</span>}
                            </div>
                            <span className={cn("text-on-surface font-mono tracking-wide", item.c)}>{item.v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <h5 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="w-6 h-[1px] bg-on-surface-variant/30"></div>
                        Technical Routing
                      </h5>
                      <div className="space-y-4 bg-surface-container-lowest p-6 border border-outline/20 rounded-sm">
                        {[
                          { l: 'Ballast Leg', v: calculation.ballastLeg || calculation.distanceToLoad },
                          { l: 'Laden Leg', v: calculation.ladenLeg || calculation.distanceVoyage },
                          { l: 'Vessel Speed', v: '12.5 kts', s: calculation.speedStatus },
                          { l: 'Route Integrity', v: calculation.routeIntegrity || 'Unknown', c: calculation.routeIntegrity?.includes('weak') ? 'text-error' : 'text-tertiary', s: calculation.routeConfidence ? `Confidence: ${calculation.routeConfidence}` : 'Assumed Data' },
                          { l: 'Ballast Severity', v: calculation.ballastSeverity || 'Unknown', c: calculation.ballastSeverity?.includes('Extreme') ? 'text-error' : '' }
                        ].map(item => (
                          <div key={item.l} className="flex justify-between items-center text-[11px] font-sans">
                            <div className="flex flex-col">
                              <span className="text-on-surface-variant tracking-wide font-light">{item.l}</span>
                              {item.s && <span className="text-[9px] text-on-surface-variant/70 italic mt-0.5">{item.s}</span>}
                            </div>
                            <span className={cn("text-on-surface font-mono tracking-wide text-right", item.c)}>{item.v}</span>
                          </div>
                        ))}
                        <div className="mt-4 pt-4 border-t border-outline/10">
                          <p className="text-[9px] text-on-surface-variant italic">Distance estimated based on internal/default routing assumptions — verify with routing tool before fixture-grade calculation.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Market Note */}
                  <div className="bg-primary/5 p-6 border border-primary/20 rounded-sm">
                    <p className="text-[12px] text-on-surface font-sans font-light leading-loose flex flex-col gap-2">
                       <span className="text-[9px] text-primary/80 font-medium tracking-[0.2em] not-italic uppercase mb-1">Broker Advisory</span>
                      {calculation.reasoning}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full opacity-60 text-center py-10 sm:py-20 px-4 sm:px-8">
                  <div className="relative mb-6 sm:mb-8">
                    <div className="w-16 sm:w-24 h-16 sm:h-24 rounded-full border border-outline flex items-center justify-center bg-surface-container-lowest">
                      <NavIcon className="h-6 sm:h-10 w-6 sm:w-10 text-on-surface-variant stroke-1" />
                    </div>
                  </div>
                  <h4 className="text-xl sm:text-2xl font-display font-light text-on-surface tracking-tight mb-3 sm:mb-4">Awaiting Instructions</h4>
                  <p className="text-xs sm:text-sm font-sans font-light text-on-surface-variant max-w-[280px] sm:max-w-[300px] leading-relaxed">
                    Select a cargo package from the left and available tonnage from the right to initiate advanced routing simulations.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Vessel Selection (25%) */}
        <div className={cn(
          "lg:col-span-1 flex flex-col bg-surface overflow-hidden relative transition-all duration-300",
          activeMobileTab !== 'vessel' && "hidden lg:flex"
        )}>
           <div className="p-4 sm:p-6 border-b border-outline/20 bg-surface-container-lowest flex items-center justify-between">
            <h3 className="text-[9px] sm:text-[10px] font-medium text-secondary uppercase tracking-[0.2em] sm:tracking-[0.3em] flex items-center gap-3">
              <Ship className="h-4 w-4 stroke-1.5" />
              Available Tonnage
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-32 sm:pb-4 space-y-3 bg-transparent">
            {vessels.length === 0 ? (
              <div className="flex items-center justify-center h-full text-on-surface-variant text-[10px] uppercase tracking-widest">No vessels available</div>
            ) : vessels.map(vessel => (
              <div 
                key={vessel.id}
                onClick={() => {
                  setSelectedVessel(vessel);
                  if (selectedCargo) setActiveMobileTab('intelligence');
                }}
                className={cn(
                  "p-4 sm:p-5 border transition-all duration-300 cursor-pointer group rounded-sm relative overflow-hidden",
                  selectedVessel?.id === vessel.id 
                    ? "bg-secondary/5 border-secondary/30 shadow-[inset_4px_0_0_var(--color-secondary)]" 
                    : "bg-surface-container-lowest border-outline/30 hover:border-outline hover:bg-surface-container-low"
                )}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-base sm:text-sm font-sans font-medium text-on-surface tracking-wide truncate pr-2">{vessel.name}</span>
                  <span className="text-[8px] sm:text-[8px] text-secondary/70 font-mono tracking-widest leading-none pt-1">{vessel.type}</span>
                </div>
                <div className="space-y-2 sm:space-y-2 text-[11px] sm:text-[11px] font-sans">
                  <div className="flex items-start gap-2 text-on-surface-variant bg-surface-container-low/50 p-2 rounded-sm border border-outline/10">
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-50 mt-0.5 min-w-[32px]">OPEN:</span>
                    <span className="text-on-surface truncate font-medium">{vessel.openPort}</span>
                  </div>
                  <div className="flex items-start gap-2 text-on-surface-variant bg-surface-container-low/50 p-2 rounded-sm border border-outline/10">
                    <span className="text-[8px] sm:text-[9px] font-mono opacity-50 mt-0.5 min-w-[32px]">DATE:</span>
                    <span className="text-on-surface truncate font-medium">{vessel.openDate}</span>
                  </div>
                  <div className="flex justify-between items-end mt-4 sm:mt-4 pt-4 sm:pt-4 border-t border-outline/20">
                    <span className="text-on-surface font-mono font-medium tracking-wide text-[12px] sm:text-[12px]">{vessel.dwt?.toLocaleString() || 'N/A'} DWT</span>
                    <span className="text-on-surface-variant text-[10px] sm:text-[10px] uppercase font-bold tracking-widest">Y: {vessel.builtYear}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
