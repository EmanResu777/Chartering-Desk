import React, { useState, useEffect } from 'react';
import { VoyageEstimate, getLatestVoyageEstimateForSource } from '../lib/voyageEstimate';
import { VoyageEstimateModal } from './VoyageEstimateModal';
import { VoyageEstimateCard } from './VoyageEstimateCard';
import { Calculator } from 'lucide-react';
import { useAuth } from '../lib/firebase';

interface VoyageEstimateSectionProps {
  itemId: string;
  itemType: VoyageEstimate['sourceType'];
  className?: string;
  dealRoomId?: string;
  cargoId?: string;
  vesselId?: string;
  initialAssumptions?: any;
  proximityDistanceNm?: number | null;
}

export const VoyageEstimateSection: React.FC<VoyageEstimateSectionProps> = ({ 
  itemId, 
  itemType, 
  className,
  dealRoomId,
  cargoId,
  vesselId,
  initialAssumptions,
  proximityDistanceNm
}) => {
  const { user } = useAuth();
  const [estimate, setEstimate] = useState<VoyageEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchEstimate = async () => {
    if (!user || !itemId) return;
    setLoading(true);
    try {
      const latest = await getLatestVoyageEstimateForSource(itemType, itemId, user.uid);
      setEstimate(latest);
    } catch (e) {
      console.error("Failed to load voyage estimate:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstimate();
  }, [user, itemId, itemType]);

  const handleSaved = () => {
    fetchEstimate();
  };

  if (loading) {
    return <div className={`animate-pulse h-20 bg-gray-100 rounded-xl ${className}`}></div>;
  }

  return (
    <div className={className}>
      {estimate ? (
        <VoyageEstimateCard 
          estimate={estimate} 
          onEdit={() => setIsModalOpen(true)} 
          proximityDistanceNm={proximityDistanceNm}
        />
      ) : (
        <div className="border border-dashed border-gray-300 bg-gray-50/50 p-4 rounded-xl flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-3">
             <Calculator className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-semibold text-gray-900">Commercial Estimate</h4>
          <p className="text-xs text-gray-500 max-w-sm mt-1 mb-4">
             Create a quick internal voyage calculation to evaluate profitability. This is for decision-support only.
          </p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-white border border-gray-300 shadow-sm text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
          >
            Create Estimate
          </button>
        </div>
      )}

      {isModalOpen && (
        <VoyageEstimateModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          sourceType={itemType}
          sourceId={itemId}
          dealRoomId={dealRoomId}
          cargoId={cargoId}
          vesselId={vesselId}
          initialAssumptions={initialAssumptions}
          existingEstimate={estimate || undefined}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};
