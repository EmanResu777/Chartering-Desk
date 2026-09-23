import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function determineRelevanceStatus(subject: string, sender: string, bodySnippet: string = ''): 'likely_cargo' | 'likely_vessel' | 'likely_mixed' | 'maybe_relevant' | 'irrelevant' {
  const text = `${subject} ${sender} ${bodySnippet}`.toLowerCase();
  
  const irrelevantKeywords = ['bank', 'invoice', 'social media', 'newsletter', 'marketing', 'login', 'security alert', 'receipt', 'subscription', 'payment confirmation', 'do-not-reply', 'no-reply', 'prompts to', 'credits let', 'credits left', 'unsubscribe', 'opt out', 'mailer-daemon', 'postmaster', 'html', '<head', '<body', '<div', 'garbage', 'longer you wait', 'saas', 'free credits', 'promo'];
  for (const word of irrelevantKeywords) {
    if (text.includes(word) && !text.includes('chartering') && !text.includes('vessel') && !text.includes('cargo') && !text.includes('laycan')) {
      return 'irrelevant';
    }
  }

  const cargoKeywords = ['cargo', ' stem ', 'shipment', 'fixing', 'laycan', ' discharging', 'discharge', ' mt ', 'cbm', 'bulk', 'bagged', 'project cargo', 'fertilizer', 'urea', 'cement', 'grain', 'wheat', 'coal', 'petcoke', 'steel', 'billets', ' ore ', 'phosphate', 'rice', 'freight'];
  const vesselKeywords = ['vessel', ' mv ', ' mt ', ' open ', 'position', 'tonnage', 'dwt', 'dwat', 'mpp', 'handy', 'supramax', 'panamax', 'geared', 'gearless', 'cranes', 'open port', 'prompt', 'spot', 'owner', 'manager'];
  const charteringKeywords = ['chartering', 'fixture', 'broker', 'shipbroker', 'commission', 'c/p', 'charter party', 'demurrage', 'despatch', 'bdi', 'baltic index', 'bunker', 'tce'];

  let hasCargo = false;
  let hasVessel = false;
  let hasChartering = false;

  for (const word of cargoKeywords) {
    if (text.includes(word)) { hasCargo = true; break; }
  }
  for (const word of vesselKeywords) {
    if (text.includes(word)) { hasVessel = true; break; }
  }
  for (const word of charteringKeywords) {
    if (text.includes(word)) { hasChartering = true; break; }
  }

  if (hasCargo && hasVessel) return 'likely_mixed';
  if (hasCargo) return 'likely_cargo';
  if (hasVessel) return 'likely_vessel';

  if (hasChartering) return 'maybe_relevant';
  
  return 'irrelevant';
}

export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(fieldName => {
        const value = row[fieldName];
        const displayValue = value === null || value === undefined ? '' : 
                           typeof value === 'object' ? JSON.stringify(value) : value;
        const escaped = ('' + displayValue).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ];
  
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(data: any[], filename: string) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export type MarketRequestType = 'cargo_search' | 'tonnage_search' | 'available_vessel';
export type MarketRequestStatus = 'active' | 'matched' | 'negotiating' | 'closed' | 'expired' | 'cancelled';
export type MarketRequestVisibility = 'private' | 'desk' | 'network';

export interface MarketRequest {
  id: string;
  type: MarketRequestType;
  vesselType?: string;
  cargoType?: string;
  quantityMin?: number;
  quantityMax?: number;
  dwtMin?: number;
  dwtMax?: number;
  loadArea?: string;
  dischargeArea?: string;
  loadLocation?: import('./locationIntelligence').GeoLocation;
  dischargeLocation?: import('./locationIntelligence').GeoLocation;
  dateFrom?: string;
  dateTo?: string;
  targetFreight?: string;
  charterType?: 'voyage' | 'time charter' | 'trip charter' | 'period' | 'coa' | 'other';
  vesselName?: string;
  yearBuilt?: number;
  flag?: string;
  gear?: string;
  holdsHatches?: string;
  remarks?: string;
  urgency?: 'normal' | 'urgent';
  visibility: MarketRequestVisibility;
  status: MarketRequestStatus;
  expiryAt?: string;
  createdByUid: string;
  createdByDeskId: string;
  createdAt: string;
  updatedAt: string;
  matchedItemIds?: string[];
  dismissedBy?: string[];
  interestedBy?: string[];
}

export type VesselStatus = 'OPEN' | 'FIXED' | 'ON SUB' | 'ARCHIVED';

export interface Vessel {
  id: string;
  name: string;
  type: string;
  dwt: number;
  grt: number;
  nrt: number;
  builtYear: number;
  status: VesselStatus;
  openPort: string;
  openDate: string;
  owner: string;
  updatedAt: string;
  confidence?: number;
  holds?: number;
  cubicCapacity?: string;
  imo?: string;
  mmsi?: string;
  flag?: string;
  privateNotes?: string;
  notes?: string;
  currentLocation?: import('./locationIntelligence').GeoLocation;
  openingLocation?: import('./locationIntelligence').GeoLocation;
  workspaceId?: string;
  userId?: string;
  visibility?: 'private' | 'desk_network';
  sharedItemId?: string;
  gear?: string;
  cranes?: string;
  
  // location intelligence fields (map-ready)
  portName?: string;
  country?: string;
  region?: string;
  latitude?: number | null;
  longitude?: number | null;
  positionSource?: string;
  positionUpdatedAt?: string;
  positionReceivedAt?: string;
  locationConfidence?: string | number;
  sanitizedPreview?: string;
  
  // extra AIS fields
  course?: number | null;
  speed?: number | null;
  heading?: number | null;
  navigationStatus?: string | null;
  destination?: string | null;
  eta?: string | null;
  aisStale?: boolean;

  insurance?: {
    policyNumber: string;
    provider: string;
    premium: string;
    expiryDate: string;
    coverageDetails: string;
    documentName?: string;
  };
}

export interface Cargo {
  id: string;
  commodity: string;
  quantity: string;
  loadPort: string;
  dischargePort: string;
  laycan: string;
  charterer: string;
  category: 'DRY BULK' | 'PROJECT CARGO' | 'TANKER' | 'GENERAL';
  status: 'ACTIVE' | 'ON HOLD' | 'NEGOTIATING' | 'FIRM' | 'COMPLETED';
  confidence?: number;
  priority?: 'HOT' | 'NORMAL';
  stowageFactor?: string;
  description?: string;
  terms?: string;
  privateNotes?: string;
  assignedVesselId?: string;
  vesselETA?: string;
  visibility?: 'private' | 'desk_network';
  sharedItemId?: string;
  freightIdea?: string;
  loadLocation?: import('./locationIntelligence').GeoLocation;
  dischargeLocation?: import('./locationIntelligence').GeoLocation;
  rate?: string;
  freightRate?: string;
  commission?: string;
  addcom?: string;
}

export interface Email {
  id: string;
  sender: string;
  subject: string;
  timestamp: string;
  summary: string;
  classification: 'CARGO' | 'VESSEL' | 'MARKET INTEL' | string;
  category?: 'DRY BULK' | 'PROJECT CARGO' | 'TANKER' | 'VESSEL POSITION' | 'GENERAL' | string;
  subCategory?: string; // e.g. "Capesize", "Handysize", "Grain", "Heavy Lift"
  confidence: number;
  rawBody: string;
  accountId?: string;
  provider?: 'gmail' | 'outlook' | 'icloud' | 'imap';
  relevanceStatus?: 'likely_cargo' | 'likely_vessel' | 'likely_mixed' | 'maybe_relevant' | 'irrelevant' | 'already_processed';
}

export interface OwnerLossCalculatorInputs {
  vesselSpeedBallast: number;
  vesselSpeedLaden: number;
  dailyBunkerConsumptionBallast: number;
  dailyBunkerConsumptionLaden: number;
  idleConsumption: number;
  currentBunkerPrice: number;
  estimatedPortCosts: number;
  canalCosts: number;
  estimatedWaitingDays: number;
  dailyHire: number;
  freightRate: number;
}

export interface OwnerLossCalculatorOutputs {
  ballastDistance: number;
  ballastDays: number;
  estimatedBallastBunkerCost: number;
  estimatedIdleWaitingCost: number;
  estimatedPortCanalCosts: number;
  totalPreLoadingOwnerCost: number;
  estimatedTCE: number;
  ownerLossBeforeLoading: number;
  recommendation: 'Strong Match' | 'Conditional Match' | 'Weak Match' | 'Reject / Not Commercial';
}

export interface MatchResult {
  vesselId: string;
  cargoId: string;
  score: number;
  technicalFit: number;
  positionFit: number;
  laycanFit: number;
  commercialViability: number;
  riskAdjustment: number;
  reasoning: string[];
  eta: string;
  distance: string;
  missingCommercialData?: boolean;
  missingPositionData?: boolean;
  positionEvidence?: 'coordinates_supplied' | 'port_name_only';
  calculatorInputs?: OwnerLossCalculatorInputs;
  calculatorOutputs?: OwnerLossCalculatorOutputs;
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  type: 'VESSEL' | 'CARGO';
  email: string;
  phone: string;
  country: string;
  specialization: string[];
  lastInteraction: string;
}
