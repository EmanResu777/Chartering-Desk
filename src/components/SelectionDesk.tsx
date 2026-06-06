import React, { useState, useEffect } from 'react';
import { Ship, Package2, ArrowRight, Zap, Loader2, Info, TrendingUp, DollarSign, Fuel, Map, Navigation as NavIcon, Calendar } from 'lucide-react';
import { Cargo, Vessel, INITIAL_CARGO, INITIAL_VESSELS, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentEditor } from './DocumentEditor';
import { useNotification } from '../lib/NotificationContext';
import { useConfig } from '../lib/ConfigContext';

interface VoyageCalculation {
  distanceToLoad: string;
  distanceVoyage: string;
  totalDistance: string;
  daysTotal: string;
  portDays?: string;
  fuelConsumption: string;
  fuelCost: string;
  portCosts: string;
  totalExpenses: string;
  estimatedFreight: string;
  profitability: string;
  tce: string;
  reasoning: string;
  commercialStatus: string;
  completenessScore: number;
  assumedInputs: string[];
  missingInputs: string[];
  confirmedInputs: string[];
  routeIntegrity: string;
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
    if (!process.env.GEMINI_API_KEY) {
      setError("AI API Key not configured.");
      notify({ title: 'AI Configuration', message: 'API Key is missing.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setError(null);
    setCalculation(null);
    // Switch to intelligence tab when calculation starts if on mobile
    setActiveMobileTab('intelligence');
    
    notify({
      title: 'Calculating Voyage',
      message: `Analyzing route for ${vessel.name} and ${cargo.commodity}...`,
      type: 'info'
    });

    try {
      const overridesStr = JSON.stringify(currentOverrides);
      const resp = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          contents: `Voyage Calculation Request:
Vessel: ${vessel.name} (${vessel.type}, ${vessel.dwt} DWT) Open: ${vessel.openPort}
Cargo: ${cargo.commodity} (${cargo.quantity}) ${cargo.loadPort} -> ${cargo.dischargePort}
Manual Overrides: ${overridesStr}

CRITICAL RULES:
1. If freight rate or lump sum is NOT explicitly in the cargo details or overrides, DO NOT invent a rate (e.g. $35/mt). Set estimatedFreight to "Pending", profitability to "Indicative calculation only", and tce to "Pending".
2. If cargo is given ONLY in CBM and NO weight in MT is confirmed (in details or overrides), DO NOT convert using arbitrary stowage factor. Warn user: "Weight not confirmed. CBM-to-MT conversion based on assumed SF."
3. Port PDA: Default to $30,000 per port unless overridden. Mark as "Assumed" if not overridden.
4. Bunker: Use VLSFO~$650/mt unless overridden. Mark as "Assumed" if not overridden.
5. Consumption: Use 21mt/day laden unless overridden. Mark "Assumed".
6. Commercial Data Completeness Score (0-100):
   - Freight known? (yes=+30, no=+0)
   - Cargo MT known? (yes=+20, no=+0)
   - PDA overridden/known? (yes=+15, no=+0)
   - Bunker overridden/known? (yes=+15, no=+0)
   - Consumption overridden/known? (yes=+20, no=+0)
7. Commercial Status:
   - If missing freight/MT: "Indicative only / Needs Freight Input"
   - Else if <70 score: "Indicative Estimate"
   - Else: "Confirmed Calculation"
8. Route Integrity & Ballast: Evaluate distance from open port to load port.
   - If extreme ballast (e.g., Europe to Middle East), set routeIntegrity: "Technically possible / Commercially weak" and ballastSeverity: "Extreme". 
   - commercialRecommendation: e.g. "Weak / Not Recommended unless premium freight or repositioning compensation is confirmed." For normal routes: "Conditional Match" or "Strong Match".
9. DWT Margin: If Cargo MT > 85% of Vessel DWT, set dwtUtilizationWarning: "High intake utilization. Confirm actual intake and draft restrictions." (otherwise null).

Respond ONLY in JSON matching this schema:
{
  "distanceToLoad":"str", "distanceVoyage":"str", "totalDistance":"str",
  "daysTotal":"str", "portDays": "str", 
  "fuelConsumption":"str", "fuelCost":"str", 
  "portCosts":"str", "totalExpenses":"str", 
  "estimatedFreight":"str", "profitability":"str", "tce":"str", 
  "commercialStatus":"str", "completenessScore": number,
  "confirmedInputs":["str"], "assumedInputs":["str"], "missingInputs":["str"],
  "routeIntegrity":"str", "ballastSeverity":"str", "commercialRecommendation":"str",
  "dwtUtilizationWarning":"str or null",
  "reasoning":"str (Mention any warnings here)"
}`
        })
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with AI");
      }

      const result = await resp.json();
      const text = result.text;
      if (!text) throw new Error("No response from AI");
      
      const jsonStr = text.replace(/```(json)?|```/g, '').trim();
      const data = JSON.parse(jsonStr) as VoyageCalculation;
      setCalculation(data);
      notify({
        title: 'Intelligence Ready',
        message: 'Voyage calculation and TCE analysis complete.',
        type: 'success'
      });
    } catch (err: any) {
      console.error("Calculation error:", err);
      setError("Failed to generate voyage intelligence. Please verify coordinates.");
      notify({
        title: 'Calculation Failed',
        message: 'AI failed to process the voyage plan.',
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
                        {calculation.completenessScore >= 70 ? "Above Market" : "Indicative / Pending"}
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
                        {calculation.completenessScore >= 70 ? "Estimated Return" : "Not fixture-grade"}
                      </p>
                    </div>
                  </div>

                  {/* Commercial Warnings */}
                  <div className={cn("bg-surface-container p-4 border rounded-sm", calculation.completenessScore < 70 ? "border-error/50" : "border-outline/20")}>
                    <h4 className={cn("text-[9px] font-medium uppercase tracking-[0.3em] mb-3", calculation.completenessScore < 70 || calculation.commercialRecommendation?.includes('Weak') ? "text-error" : "text-tertiary")}>
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
                    {calculation.completenessScore < 70 && (
                      <p className="text-[11px] text-on-surface-variant mb-2">Based on assumed economics. Do not treat as fixture-grade calculation.</p>
                    )}
                    <ul className="text-[10px] text-on-surface list-disc pl-4 space-y-1">
                      {calculation.missingInputs?.map((m: string, i: number) => <li key={`m-${i}`} className="text-error/90">Missing: {m}</li>)}
                      {calculation.assumedInputs?.map((a: string, i: number) => <li key={`a-${i}`} className="text-on-surface-variant">Assumed: {a}</li>)}
                      {calculation.confirmedInputs?.map((c: string, i: number) => <li key={`c-${i}`} className="text-tertiary/90">Confirmed: {c}</li>)}
                    </ul>
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
                    </div>
                    <div className="w-full sm:flex-1 py-4 sm:py-8 px-4 flex flex-col items-center">
                      <Calendar className="h-6 w-6 text-tertiary/50 mb-3 stroke-1" />
                      <p className="text-[9px] text-on-surface-variant uppercase font-medium tracking-[0.2em] mb-2">Duration</p>
                      <p className="text-lg sm:text-xl text-on-surface font-mono font-light">{calculation.daysTotal}</p>
                    </div>
                    <div className="w-full sm:flex-1 py-4 sm:py-8 px-4 flex flex-col items-center">
                      <Fuel className="h-6 w-6 text-primary/50 mb-3 stroke-1" />
                      <p className="text-[9px] text-on-surface-variant uppercase font-medium tracking-[0.2em] mb-2">Bunker</p>
                      <p className="text-lg sm:text-xl text-on-surface font-mono font-light">{calculation.fuelConsumption}</p>
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
                        {[{ l: 'Est. Freight', v: calculation.estimatedFreight }, { l: 'Bunker Cost', v: calculation.fuelCost }, { l: 'Port PDA', v: calculation.portCosts }, { l: 'Total OPEX', v: calculation.totalExpenses, c: 'text-error font-medium' }].map(item => (
                          <div key={item.l} className="flex justify-between items-center text-[11px] font-sans">
                            <span className="text-on-surface-variant tracking-wide font-light">{item.l}</span>
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
                        {[{ l: 'Ballast Leg', v: calculation.distanceToLoad }, { l: 'Laden Leg', v: calculation.distanceVoyage }, { l: 'Vessel Speed', v: '12.5 kts' }, { l: 'Route Integrity', v: calculation.routeIntegrity || 'Unknown', c: calculation.routeIntegrity?.includes('weak') ? 'text-error' : 'text-tertiary' }, { l: 'Ballast Severity', v: calculation.ballastSeverity || 'Unknown', c: calculation.ballastSeverity?.includes('Extreme') ? 'text-error' : '' }].map(item => (
                          <div key={item.l} className="flex justify-between items-center text-[11px] font-sans">
                            <span className="text-on-surface-variant tracking-wide font-light">{item.l}</span>
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
