import React from 'react';
import { VoyageEstimate, VOC_LABEL_COLORS } from '../lib/voyageEstimate';
import { Calculator, AlertTriangle, FileText, Info } from 'lucide-react';

interface VoyageEstimateCardProps {
  estimate: VoyageEstimate;
  onEdit?: () => void;
  className?: string;
  proximityDistanceNm?: number | null;
}

export function VoyageEstimateCard({ estimate, onEdit, className = '', proximityDistanceNm }: VoyageEstimateCardProps) {
  const { calculated, riskFlags, confidenceLevel } = estimate;

  const ballastAssumption = estimate.assumptions?.ballastDistance || 0;
  const isDistanceMismatch = proximityDistanceNm != null && ballastAssumption > 0 && Math.abs(proximityDistanceNm - ballastAssumption) > 500;

  React.useEffect(() => {
    if (isDistanceMismatch) {
      import('../lib/proximityIntelligence').then(({ logProximityAudit }) => {
        logProximityAudit('proximity_estimate_assumption_mismatch', {
          proximityLabel: `Real ~${proximityDistanceNm?.toFixed(0)} NM vs Assumed ${ballastAssumption} NM`,
          sourceModule: 'voyage_estimate_card'
        });
      });
    }
  }, [isDistanceMismatch, proximityDistanceNm, ballastAssumption]);

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h3 className="font-medium text-gray-900">Commercial Estimate</h3>
          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${VOC_LABEL_COLORS[calculated.attractivenessLabel] || 'bg-gray-100'}`}>
            {calculated.attractivenessLabel.toUpperCase()}
          </span>
        </div>
        {onEdit && (
          <button onClick={onEdit} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Edit
          </button>
        )}
      </div>

      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-500">Estimated TCE</p>
          <p className="text-lg font-bold text-gray-900">${calculated.estimatedTcePerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}/day</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Gross Freight</p>
          <p className="text-sm font-medium text-gray-900">${calculated.grossFreight.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Voyage Costs</p>
          <p className="text-sm font-medium text-red-600">-${calculated.voyageCostEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Days</p>
          <p className="text-sm font-medium text-gray-900">{calculated.totalVoyageDays.toFixed(1)}</p>
        </div>
      </div>

      {(Object.values(riskFlags).some(v => v) || isDistanceMismatch) && (
        <div className="px-4 pb-4 space-y-2">
          {isDistanceMismatch && (
            <div className="bg-orange-50 rounded-md p-2 flex items-start text-xs text-orange-800">
               <Info className="w-4 h-4 mr-1.5 shrink-0 text-orange-600 mt-0.5" />
               <div>
                 <strong>Distance Mismatch: </strong>
                 Estimate assumes {ballastAssumption} NM ballast, but estimated sea route indicates ~{proximityDistanceNm?.toFixed(0)} NM.
                 {onEdit && (
                    <button onClick={onEdit} className="ml-2 underline font-medium hover:text-orange-900">Review assumptions</button>
                 )}
               </div>
            </div>
          )}
          {Object.values(riskFlags).some(v => v) && (
            <div className="bg-yellow-50 rounded-md p-2 flex items-start text-xs text-yellow-800">
              <AlertTriangle className="w-4 h-4 mr-1.5 shrink-0 text-yellow-600" />
              <span>
                <strong>Risks/Missing: </strong> 
                {[
                  riskFlags.missingFreightIdea && 'Freight Idea',
                  riskFlags.missingDistance && 'Distance',
                  riskFlags.missingBunkerPrice && 'Bunker Price',
                  riskFlags.cargoAboveIntake && 'Intake limits',
                  riskFlags.highPortTime && 'High port time'
                ].filter(Boolean).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {estimate.notes && (
         <div className="px-4 pb-4">
            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded flex items-start">
               <FileText className="w-3.5 h-3.5 mr-1 mt-0.5 text-gray-400 shrink-0" />
               <span className="italic">"{estimate.notes}"</span>
            </div>
         </div>
      )}
    </div>
  );
}
