import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/firebase';
import { useConfig } from '../lib/ConfigContext';
import { 
  VoyageEstimateAssumptions, 
  VoyageEstimateCalculated, 
  VoyageEstimateRiskFlags,
  calculateVoyageEstimate,
  saveVoyageEstimate,
  VoyageEstimate,
  VOC_LABEL_COLORS
} from '../lib/voyageEstimate';
import { Save, RefreshCw, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface VoyageEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceType: VoyageEstimate['sourceType'];
  sourceId: string;
  initialAssumptions?: Partial<VoyageEstimateAssumptions>;
  existingEstimate?: VoyageEstimate;
  dealRoomId?: string;
  cargoId?: string;
  vesselId?: string;
  onSaved?: (estimateId: string) => void;
}

export function VoyageEstimateModal({ 
  isOpen, 
  onClose, 
  sourceType, 
  sourceId, 
  initialAssumptions,
  existingEstimate,
  dealRoomId,
  cargoId,
  vesselId,
  onSaved 
}: VoyageEstimateModalProps) {
  const { user } = useAuth();
  const { t } = useConfig();
  
  const [deskId, setDeskId] = useState<string | null>(null);
  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, 'users', user.uid)).then(d => {
        if (d.exists() && d.data().deskId) setDeskId(d.data().deskId);
      });
    }
  }, [user]);

  const [assumptions, setAssumptions] = useState<VoyageEstimateAssumptions>({
    loadPort: '', dischargePort: '', cargoQuantity: 0, freightIdea: 0, isLumpSum: false,
    vesselDWT: 0, vesselIntakeEstimate: 0, ballastDistance: 0, ladenDistance: 0,
    speedBallast: 0, speedLaden: 0, bunkerConsumptionBallast: 0, bunkerConsumptionLaden: 0,
    idlePortConsumption: 0, bunkerPrice: 0, loadPortDays: 0, dischargePortDays: 0, waitingDays: 0,
    canalCost: 0, portCost: 0, commissionPercentage: 0, addressCommissionPercentage: 0, otherCost: 0,
    ...initialAssumptions
  });

  const [notes, setNotes] = useState(existingEstimate?.notes || '');
  const [visibility, setVisibility] = useState<VoyageEstimate['visibility']>(existingEstimate?.visibility || 'private');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingEstimate) {
      setAssumptions(existingEstimate.assumptions);
      setNotes(existingEstimate.notes || '');
      setVisibility(existingEstimate.visibility);
    } else if (initialAssumptions) {
      setAssumptions(prev => ({ ...prev, ...initialAssumptions }));
    }
  }, [existingEstimate, initialAssumptions, isOpen]);

  if (!isOpen) return null;

  const { calculated, riskFlags, confidenceLevel } = calculateVoyageEstimate(assumptions);

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    try {
      const estimateData: Partial<VoyageEstimate> = {
        id: existingEstimate?.id,
        createdByUid: user.uid,
        createdByDeskId: deskId || undefined,
        visibility,
        sourceType,
        sourceId,
        dealRoomId,
        cargoId,
        vesselId,
        assumptions,
        calculated,
        riskFlags,
        confidenceLevel,
        notes
      };
      
      const id = await saveVoyageEstimate(estimateData);
      
      // Attempt to save an audit via alertService if needed or just trigger onSaved
      if (onSaved) onSaved(id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof VoyageEstimateAssumptions, value: any) => {
    setAssumptions(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/50 backdrop-blur-sm sm:p-6 lg:p-8 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b shrink-0 bg-gray-50 gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Commercial Estimate / TCE Lite</h2>
            <p className="text-sm text-gray-500">Internal decision-support tool. Missing assumptions remain zero/pending until explicitly supplied.</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-4 sm:gap-6">
          
          {/* Left Column - Inputs */}
          <div className="flex-1 space-y-6">
            <div className="space-y-4">
              <h3 className="text-md font-semibold border-b pb-2">Voyage Assumptions</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Cargo Qty (MT)</label>
                  <input type="number" value={assumptions.cargoQuantity} onChange={e => handleChange('cargoQuantity', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Vessel Intake (MT)</label>
                  <input type="number" value={assumptions.vesselIntakeEstimate} onChange={e => handleChange('vesselIntakeEstimate', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                   <label className="block text-xs font-medium text-gray-700">Freight Idea</label>
                   <div className="flex mt-1">
                     <input type="number" value={assumptions.freightIdea} onChange={e => handleChange('freightIdea', Number(e.target.value))} className="block w-full rounded-l-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                     <button onClick={() => handleChange('isLumpSum', !assumptions.isLumpSum)} className="px-3 py-1 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md text-sm text-gray-700 hover:bg-gray-200">
                        {assumptions.isLumpSum ? 'LS' : '$/MT'}
                     </button>
                   </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Bunker Price ($/MT)</label>
                  <input type="number" value={assumptions.bunkerPrice} onChange={e => handleChange('bunkerPrice', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Ballast Dist (nm)</label>
                  <input type="number" value={assumptions.ballastDistance} onChange={e => handleChange('ballastDistance', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Laden Dist (nm)</label>
                  <input type="number" value={assumptions.ladenDistance} onChange={e => handleChange('ladenDistance', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Ballast Speed (kts) / Cons (mt/d)</label>
                  <div className="flex space-x-2 mt-1">
                     <input type="number" value={assumptions.speedBallast} onChange={e => handleChange('speedBallast', Number(e.target.value))} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                     <input type="number" value={assumptions.bunkerConsumptionBallast} onChange={e => handleChange('bunkerConsumptionBallast', Number(e.target.value))} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Laden Speed (kts) / Cons (mt/d)</label>
                  <div className="flex space-x-2 mt-1">
                     <input type="number" value={assumptions.speedLaden} onChange={e => handleChange('speedLaden', Number(e.target.value))} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                     <input type="number" value={assumptions.bunkerConsumptionLaden} onChange={e => handleChange('bunkerConsumptionLaden', Number(e.target.value))} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Load Days</label>
                  <input type="number" value={assumptions.loadPortDays} onChange={e => handleChange('loadPortDays', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Disch Days</label>
                  <input type="number" value={assumptions.dischargePortDays} onChange={e => handleChange('dischargePortDays', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Wait Days</label>
                  <input type="number" value={assumptions.waitingDays} onChange={e => handleChange('waitingDays', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Total Comm (%)</label>
                  <input type="number" value={assumptions.commissionPercentage + assumptions.addressCommissionPercentage} onChange={e => handleChange('commissionPercentage', Number(e.target.value))} step="0.25" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" />
                </div>
                <div>
                   <label className="block text-xs font-medium text-gray-700">Port Costs ($)</label>
                   <input type="number" value={assumptions.portCost} onChange={e => handleChange('portCost', Number(e.target.value))} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm" />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">Manual Notes (Private by default)</label>
              <textarea 
                rows={2} 
                value={notes} 
                onChange={e => setNotes(e.target.value)}
                placeholder="Add private assumptions or comments..." 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              />
            </div>
             <div>
              <label className="block text-sm font-medium text-gray-700">Visibility</label>
              <select 
                value={visibility} 
                onChange={e => setVisibility(e.target.value as any)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="private">Private (Only Me)</option>
                <option value="my_desk">My Desk</option>
              </select>
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="flex-1 space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-md font-semibold border-b pb-2 flex items-center justify-between">
              <span>Results</span>
              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${VOC_LABEL_COLORS[calculated.attractivenessLabel] || 'bg-gray-100'}`}>
                {calculated.attractivenessLabel.toUpperCase()}
              </span>
            </h3>

            <div className="space-y-3 pb-4 border-b">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Gross Freight</span>
                <span className="font-medium">${calculated.grossFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-red-600">
                <span>Commission</span>
                <span>-${calculated.commissionAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-700 font-medium pt-1 border-t">
                <span>Net Freight</span>
                <span>${calculated.netFreightEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            <div className="space-y-3 pb-4 border-b">
              <div className="flex justify-between items-center text-sm">
                 <span className="text-gray-500">Voyage Days</span>
                 <span className="font-medium">{calculated.totalVoyageDays.toFixed(1)} days</span>
              </div>
               <div className="flex justify-between items-center text-sm text-red-600">
                 <span>Voyage Costs (Bunker/Port)</span>
                 <span>-${calculated.voyageCostEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
            
            <div className="bg-indigo-50 p-4 rounded-lg flex items-center justify-between border border-indigo-100">
               <div>
                 <p className="text-sm text-indigo-700 font-medium">Estimated TCE</p>
                 <p className="text-2xl font-bold text-indigo-900">${calculated.estimatedTcePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })} / day</p>
               </div>
               {calculated.breakevenFreightIdea && calculated.breakevenFreightIdea > 0 && (
                 <div className="text-right">
                   <p className="text-xs text-indigo-500 font-medium">Breakeven</p>
                   <p className="text-sm font-semibold text-indigo-700">${calculated.breakevenFreightIdea.toFixed(2)}</p>
                 </div>
               )}
            </div>

            {(confidenceLevel === 'low' || Object.values(riskFlags).some(v => v)) && (
               <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mt-4 space-y-2">
                 <div className="flex items-center text-yellow-800 font-medium text-sm">
                   <AlertTriangle className="w-4 h-4 mr-2" />
                   Risk Flags & Missing Data
                 </div>
                 <ul className="text-xs text-yellow-700 space-y-1 list-disc pl-5">
                   {riskFlags.missingFreightIdea && <li>Missing Freight Idea</li>}
                   {riskFlags.missingDistance && <li>Missing route distance.</li>}
                   {riskFlags.missingBunkerPrice && <li>Missing Bunker Price.</li>}
                   {riskFlags.cargoAboveIntake && <li>Cargo quantity exceeds vessel intake estimate.</li>}
                   {riskFlags.longBallastLeg && <li>Ballast leg is highly disproportionate to laden leg.</li>}
                   {riskFlags.highPortTime && <li>Port/waiting time exceeds total sea time.</li>}
                 </ul>
               </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500 flex items-center max-w-sm">
            <Info className="w-4 h-4 mr-1 shrink-0" />
            Not a final calculation or C/P claim. Indicative only.
          </div>
          <div className="flex items-center space-x-3">
             {error && <span className="text-sm text-red-600">{error}</span>}
             <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">Cancel</button>
             <button onClick={handleSave} disabled={isSaving} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
               {isSaving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
               Save Estimate
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}
