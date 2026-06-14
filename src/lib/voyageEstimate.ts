import { db } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';

export interface VoyageEstimateAssumptions {
  loadPort?: string;
  dischargePort?: string;
  cargoQuantity?: number;
  freightIdea?: number;
  isLumpSum?: boolean;
  vesselDWT?: number;
  vesselIntakeEstimate?: number;
  ballastDistance?: number;
  ladenDistance?: number;
  speedBallast?: number;
  speedLaden?: number;
  bunkerConsumptionBallast?: number;
  bunkerConsumptionLaden?: number;
  idlePortConsumption?: number;
  bunkerPrice?: number;
  loadPortDays?: number;
  dischargePortDays?: number;
  waitingDays?: number;
  canalCost?: number;
  portCost?: number;
  commissionPercentage?: number;
  addressCommissionPercentage?: number;
  otherCost?: number;
}

export interface VoyageEstimateCalculated {
  seaDaysBallast: number;
  seaDaysLaden: number;
  totalSeaDays: number;
  totalPortWaitingDays: number;
  totalVoyageDays: number;
  bunkerCostEstimate: number;
  grossFreight: number;
  commissionAmount: number;
  netFreightEstimate: number;
  voyageCostEstimate: number;
  estimatedVoyageResult: number;
  estimatedTcePerDay: number;
  breakevenFreightIdea?: number;
  attractivenessLabel: 'attractive' | 'workable' | 'weak' | 'risky' | 'insufficient data';
}

export interface VoyageEstimateRiskFlags {
  missingFreightIdea: boolean;
  missingBunkerPrice: boolean;
  missingDistance: boolean;
  missingSpeedConsumption: boolean;
  cargoAboveIntake: boolean;
  longBallastLeg: boolean;
  laycanRisk: boolean;
  highPortTime: boolean;
  lowConfidence: boolean;
}

export interface VoyageEstimate {
  id: string;
  createdByUid: string;
  createdByDeskId?: string;
  visibility: 'private' | 'my_desk' | 'participants';
  participantUids?: string[];
  participantDeskIds?: string[];
  sourceType: 'cargo' | 'vessel' | 'deal_room' | 'smart_radar' | 'market_request' | 'hot_opp';
  sourceId: string;
  dealRoomId?: string;
  cargoId?: string;
  vesselId?: string;
  assumptions: VoyageEstimateAssumptions;
  calculated: VoyageEstimateCalculated;
  riskFlags: VoyageEstimateRiskFlags;
  confidenceLevel: 'high' | 'medium' | 'low';
  notes?: string;
  createdAt: any;
  updatedAt: any;
  auditTrail: any[];
}

export const VOC_LABEL_COLORS = {
  attractive: 'text-green-700 bg-green-50 border-green-200',
  workable: 'text-blue-700 bg-blue-50 border-blue-200',
  weak: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  risky: 'text-red-700 bg-red-50 border-red-200',
  'insufficient data': 'text-gray-700 bg-gray-50 border-gray-200',
};

export function calculateVoyageEstimate(assumptions: VoyageEstimateAssumptions): { calculated: VoyageEstimateCalculated, riskFlags: VoyageEstimateRiskFlags, confidenceLevel: 'high' | 'medium' | 'low' } {
  const {
    cargoQuantity = 0,
    freightIdea = 0,
    isLumpSum = false,
    vesselDWT = 0,
    vesselIntakeEstimate = 0,
    ballastDistance = 0,
    ladenDistance = 0,
    speedBallast = 0,
    speedLaden = 0,
    bunkerConsumptionBallast = 0,
    bunkerConsumptionLaden = 0,
    idlePortConsumption = 0,
    bunkerPrice = 0,
    loadPortDays = 0,
    dischargePortDays = 0,
    waitingDays = 0,
    canalCost = 0,
    portCost = 0,
    commissionPercentage = 0,
    addressCommissionPercentage = 0,
    otherCost = 0,
  } = assumptions;

  // Sea Days
  const seaDaysBallast = speedBallast > 0 ? ballastDistance / (speedBallast * 24) : 0;
  const seaDaysLaden = speedLaden > 0 ? ladenDistance / (speedLaden * 24) : 0;
  const totalSeaDays = seaDaysBallast + seaDaysLaden;

  // Port/Waiting Days
  const totalPortWaitingDays = loadPortDays + dischargePortDays + waitingDays;

  // Total Days
  const totalVoyageDays = totalSeaDays + totalPortWaitingDays;

  // Bunker Cost
  const bunkerCostBallast = seaDaysBallast * bunkerConsumptionBallast * bunkerPrice;
  const bunkerCostLaden = seaDaysLaden * bunkerConsumptionLaden * bunkerPrice;
  const bunkerCostPort = totalPortWaitingDays * idlePortConsumption * bunkerPrice;
  const bunkerCostEstimate = bunkerCostBallast + bunkerCostLaden + bunkerCostPort;

  // Revenue
  const grossFreight = isLumpSum ? freightIdea : freightIdea * cargoQuantity;
  const totalCommissionPct = (commissionPercentage + addressCommissionPercentage) / 100;
  const commissionAmount = grossFreight * totalCommissionPct;
  const netFreightEstimate = grossFreight - commissionAmount;

  // Voyage Costs
  const voyageCostEstimate = bunkerCostEstimate + canalCost + portCost + otherCost;

  // Result
  const estimatedVoyageResult = netFreightEstimate - voyageCostEstimate;
  const estimatedTcePerDay = totalVoyageDays > 0 ? estimatedVoyageResult / totalVoyageDays : 0;

  // Breakeven Freight Idea
  let breakevenFreightIdea = 0;
  if (!isLumpSum && cargoQuantity > 0) {
    // We need netFreight = voyageCost
    // gross = net + gross * comm => net = gross * (1 - comm)
    // voyageCost = gross * (1 - comm)
    // gross = voyageCost / (1 - comm)
    // freightIdea = gross / cargoQuantity
    if (totalCommissionPct < 1) {
       const reqGross = voyageCostEstimate / (1 - totalCommissionPct);
       breakevenFreightIdea = reqGross / cargoQuantity;
    }
  } else if (isLumpSum) {
    if (totalCommissionPct < 1) {
       breakevenFreightIdea = voyageCostEstimate / (1 - totalCommissionPct);
    }
  }

  // Risk Flags
  const riskFlags: VoyageEstimateRiskFlags = {
    missingFreightIdea: freightIdea <= 0,
    missingBunkerPrice: bunkerPrice <= 0,
    missingDistance: ballastDistance <= 0 || ladenDistance <= 0,
    missingSpeedConsumption: speedBallast <= 0 || speedLaden <= 0 || bunkerConsumptionBallast <= 0 || bunkerConsumptionLaden <= 0,
    cargoAboveIntake: vesselIntakeEstimate > 0 && cargoQuantity > vesselIntakeEstimate,
    longBallastLeg: ballastDistance > ladenDistance * 1.5,
    laycanRisk: false, // We'll leave it false unless we integrate dates later
    highPortTime: totalPortWaitingDays > totalSeaDays && totalSeaDays > 0,
    lowConfidence: false,
  };

  const hasMissingCritical = riskFlags.missingFreightIdea || riskFlags.missingBunkerPrice || riskFlags.missingDistance || riskFlags.missingSpeedConsumption;
  const hasMultipleRisks = [riskFlags.cargoAboveIntake, riskFlags.longBallastLeg, riskFlags.highPortTime].filter(Boolean).length >= 2;

  let confidenceLevel: 'high' | 'medium' | 'low' = 'high';
  if (hasMissingCritical) confidenceLevel = 'low';
  else if (hasMultipleRisks) confidenceLevel = 'medium';

  riskFlags.lowConfidence = confidenceLevel === 'low';

  // Attractiveness Label logic (arbitrary example thresholds)
  let attractivenessLabel: VoyageEstimateCalculated['attractivenessLabel'] = 'workable';
  if (confidenceLevel === 'low') {
    attractivenessLabel = 'insufficient data';
  } else if (riskFlags.cargoAboveIntake) {
    attractivenessLabel = 'risky';
  } else if (estimatedTcePerDay > 25000) {
    attractivenessLabel = 'attractive';
  } else if (estimatedTcePerDay > 10000) {
    attractivenessLabel = 'workable';
  } else {
    attractivenessLabel = 'weak';
  }

  return {
    calculated: {
      seaDaysBallast,
      seaDaysLaden,
      totalSeaDays,
      totalPortWaitingDays,
      totalVoyageDays,
      bunkerCostEstimate,
      grossFreight,
      commissionAmount,
      netFreightEstimate,
      voyageCostEstimate,
      estimatedVoyageResult,
      estimatedTcePerDay,
      breakevenFreightIdea,
      attractivenessLabel,
    },
    riskFlags,
    confidenceLevel
  };
}

export async function saveVoyageEstimate(data: Partial<VoyageEstimate>): Promise<string> {
  const isNew = !data.id;
  const ref = isNew ? doc(collection(db, 'voyageEstimates')) : doc(db, 'voyageEstimates', data.id!);
  
  const now = Timestamp.now();
  const payload = {
    ...data,
    updatedAt: now,
  } as any;

  if (isNew) {
    payload.id = ref.id;
    payload.createdAt = now;
    payload.auditTrail = [{
      action: 'created',
      timestamp: now,
      uid: data.createdByUid
    }];
  } else {
    payload.auditTrail = [
      ...(data.auditTrail || []),
      {
        action: 'updated',
        timestamp: now,
        uid: data.createdByUid
      }
    ];
  }

  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function getVoyageEstimatesForSource(sourceType: string, sourceId: string): Promise<VoyageEstimate[]> {
  const q = query(
    collection(db, 'voyageEstimates'),
    where('sourceType', '==', sourceType),
    where('sourceId', '==', sourceId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id } as VoyageEstimate));
}

export async function getLatestVoyageEstimateForSource(sourceType: string, sourceId: string, userId: string): Promise<VoyageEstimate | null> {
  const estimates = await getVoyageEstimatesForSource(sourceType, sourceId);
  if (!estimates.length) return null;
  // Sorting locally since we might not have a composite index right away
  estimates.sort((a, b) => b.updatedAt.seconds - a.updatedAt.seconds);
  return estimates[0];
}
