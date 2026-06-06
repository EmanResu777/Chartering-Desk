import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function determineRelevanceStatus(subject: string, sender: string, bodySnippet: string = ''): 'likely_cargo' | 'likely_vessel' | 'likely_mixed' | 'maybe_relevant' | 'irrelevant' {
  const text = `${subject} ${sender} ${bodySnippet}`.toLowerCase();
  
  const irrelevantKeywords = ['bank', 'invoice', 'social media', 'newsletter', 'marketing', 'login', 'security alert', 'receipt', 'subscription', 'payment confirmation', 'do-not-reply', 'no-reply'];
  for (const word of irrelevantKeywords) {
    if (text.includes(word) && !text.includes('shipping') && !text.includes('vessel') && !text.includes('cargo')) {
      return 'irrelevant';
    }
  }

  const cargoKeywords = ['cargo', ' stem ', 'shipment', 'fixing', 'laycan', ' loading', 'discharge', ' mt ', 'cbm', 'bulk', 'bagged', 'project cargo', 'fertilizer', 'urea', 'cement', 'grain', 'wheat', 'coal', 'petcoke', 'steel', 'billets', ' ore ', 'phosphate', 'rice'];
  const vesselKeywords = ['vessel', ' mv ', ' open ', 'position', 'tonnage', 'dwt', 'dwat', 'mpp', 'handy', 'supramax', 'panamax', 'geared', 'gearless', 'cranes', 'open port', 'prompt', 'spot'];

  let hasCargo = false;
  let hasVessel = false;

  for (const word of cargoKeywords) {
    if (text.includes(word)) { hasCargo = true; break; }
  }
  for (const word of vesselKeywords) {
    if (text.includes(word)) { hasVessel = true; break; }
  }

  if (hasCargo && hasVessel) return 'likely_mixed';
  if (hasCargo) return 'likely_cargo';
  if (hasVessel) return 'likely_vessel';

  if (!hasCargo && !hasVessel && text.length > 0) return 'maybe_relevant';
  
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
  workspaceId?: string;
  userId?: string;
  visibility?: 'private' | 'desk_network';
  sharedItemId?: string;
  gear?: string;
  cranes?: string;
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

export const INITIAL_CARGO: Cargo[] = [
  {
    id: 'CRG-9921-A',
    commodity: 'Iron Ore',
    quantity: '170,000 MT ±10%',
    loadPort: 'Durban (ZADUR)',
    dischargePort: 'Rotterdam (NLRTM)',
    laycan: '12-15 Nov 2024',
    charterer: 'BHP BILLITON',
    category: 'DRY BULK',
    status: 'ACTIVE',
    confidence: 85,
    priority: 'HOT',
    stowageFactor: '0.42 m³/mt',
    terms: '1/1, 2.5% TTL',
    description: 'BHP Billiton firm cargo. Ore fines in bulk. Grade 62% FE.'
  },
  {
    id: 'CRG-8820-B',
    commodity: 'Coal (Thermal)',
    quantity: '75,000 MT ±5%',
    loadPort: 'Newcastle (E_AUS)',
    dischargePort: 'Krishnapatnam (E_IND)',
    laycan: '18-20 Nov 2024',
    charterer: 'CARGILL',
    category: 'DRY BULK',
    status: 'ACTIVE',
    confidence: 60,
    stowageFactor: '1.25 m³/mt',
    terms: 'FIOST, 3.75% TTL',
    description: 'Thermal coal for private power plant in India.'
  },
  {
    id: 'CRG-1102-X',
    commodity: 'Wheat',
    quantity: '30,000 MT',
    loadPort: 'USG',
    dischargePort: 'Egypt',
    laycan: '15-25 Oct 2024',
    charterer: 'GLENCORE',
    category: 'DRY BULK',
    status: 'NEGOTIATING',
    confidence: 95,
    stowageFactor: '1.33 m³/mt',
    terms: '1/1, 1.25% ADD COM',
    description: 'Wheat in bulk. GASC tender cargo.'
  },
  {
    id: 'CRG-5512-P',
    commodity: 'Dredger Unit (Heavy Lift)',
    quantity: '1 Unit (450 MT)',
    loadPort: 'Hamburg (DEHAM)',
    dischargePort: 'Singapore (SGSIN)',
    laycan: '05-10 Dec 2024',
    charterer: 'BOSKALIS',
    category: 'PROJECT CARGO',
    status: 'ACTIVE',
    priority: 'HOT',
    description: 'Heavy lift dredger component. Loading via shore crane.'
  },
  {
    id: 'CRG-2210-T',
    commodity: 'Crude Oil',
    quantity: '270,000 MT',
    loadPort: 'Ras Tanura (SARAT)',
    dischargePort: 'Ningbo (CNNGB)',
    laycan: '01-03 Nov 2024',
    charterer: 'SAUDI ARAMCO',
    category: 'TANKER',
    status: 'FIRM',
    description: 'VLCC Stem. Standard Aramco terms.'
  }
];

export const INITIAL_VESSELS: Vessel[] = [
  {
    id: 'VSL-8842',
    name: 'MV Pacific Endeavour',
    type: 'Kamsarmax',
    dwt: 82000,
    grt: 44000,
    nrt: 26000,
    builtYear: 2018,
    status: 'OPEN',
    openPort: 'Durban (ZADUR)',
    openDate: '15-18 Nov',
    owner: 'Navios Maritime',
    updatedAt: '2M_AGO',
    confidence: 95,
    holds: 7,
    cubicCapacity: ' grain: 95,000 / bale: 92,000 CBM',
    imo: '9784561',
    mmsi: '357892000',
    flag: 'Panama'
  },
  {
    id: 'VSL-5021',
    name: 'MV Ocean Giant',
    type: 'Capesize',
    dwt: 180000,
    grt: 93500,
    nrt: 62000,
    builtYear: 2012,
    status: 'FIXED',
    openPort: 'Singapore (SGSIN)',
    openDate: 'TBD',
    owner: 'Oldendorff',
    updatedAt: '1H_AGO',
    confidence: 100,
    holds: 9,
    cubicCapacity: 'grain: 198,000 / bale: 195,000 CBM',
    imo: '9620584',
    mmsi: '241151000',
    flag: 'Liberia'
  },
  {
    id: 'VSL-9011',
    name: 'MV Nordic Star',
    type: 'Ultramax',
    dwt: 63500,
    grt: 36000,
    nrt: 21500,
    builtYear: 2021,
    status: 'OPEN',
    openPort: 'Houston (USHOU)',
    openDate: '02-05 Dec',
    owner: 'Star Bulk',
    updatedAt: '10M_AGO',
    confidence: 92,
    holds: 5,
    cubicCapacity: 'grain: 78,500 / bale: 75,000 CBM',
    imo: '9912456',
    mmsi: '538009234',
    flag: 'Marshall Islands'
  }
];

export const INITIAL_EMAILS: Email[] = [
  {
    id: 'MSG-001',
    sender: 'broker@globalshipping.com',
    subject: 'Capesize Spot Cargo - 150k Iron Ore',
    timestamp: '09:42Z',
    summary: 'Firm offer for iron ore loading Durban discharging Rotterdam.',
    classification: 'CARGO',
    category: 'DRY BULK',
    subCategory: 'Capesize',
    confidence: 98,
    rawBody: 'FIRM OFFER: 150k Iron Ore Durban/Rotterdam. Laycan 15-25 Oct. Charterer: BHP.',
    accountId: 'acc-1',
    provider: 'gmail'
  },
  {
    id: 'MSG-002',
    sender: 'ops@oceanicmarine.net',
    subject: 'MV Oceanic Pioneer Open Dalian',
    timestamp: '09:15Z',
    summary: 'Vessel position update for MV Oceanic Pioneer.',
    classification: 'VESSEL',
    category: 'VESSEL POSITION',
    subCategory: 'Kamsarmax',
    confidence: 92,
    rawBody: 'MV Oceanic Pioneer Open Dalian 12-15 Oct. 82k DWT Kamsarmax.',
    accountId: 'acc-2',
    provider: 'outlook'
  },
  {
    id: 'MSG-003',
    sender: 'chartering@heavy-lift.de',
    subject: 'PROJECT: 4x Wind Turbine Blades - Hamburg to USG',
    timestamp: '08:30Z',
    summary: 'Project cargo request for wind turbine components.',
    classification: 'CARGO',
    category: 'PROJECT CARGO',
    subCategory: 'Heavy Lift',
    confidence: 95,
    rawBody: 'WE ARE LOOKING FOR A SUITABLE MULTIPURPOSE VESSEL TO CARRY 4X WIND TURBINE BLADES. L: 52M EACH. LOAD: HAMBURG. DISCH: HOUSTON/NEW ORLEANS.',
    accountId: 'acc-1',
    provider: 'gmail'
  },
  {
    id: 'MSG-004',
    sender: 'agencies@bunkering-int.com',
    subject: 'TANKER REQ: 35k Gasoline - ARA/WAF',
    timestamp: '08:12Z',
    summary: 'Clean petroleum products inquiry.',
    classification: 'CARGO',
    category: 'TANKER',
    subCategory: 'MR Tanker',
    confidence: 90,
    rawBody: 'URGENT: 35,000 MT GASOLINE 10PPM. LOAD: ANTWERP. DISCH: LAGOS, NIGERIA. LAYCAN: 20-22 OCT.',
    accountId: 'acc-3',
    provider: 'imap'
  },
  {
    id: 'MSG-005',
    sender: 'ops@panamax-pool.com',
    subject: 'MV Polar Bright - Panamax Open Skaw',
    timestamp: '07:55Z',
    summary: 'Panamax vessel open in North Europe.',
    classification: 'VESSEL',
    category: 'VESSEL POSITION',
    subCategory: 'Panamax',
    confidence: 94,
    rawBody: 'MV Polar Bright. Panamax 75k DWT. Open Skaw 10-12 Nov. Looking for Atlantic rounds.',
    accountId: 'acc-1',
    provider: 'gmail'
  },
  {
    id: 'MSG-006',
    sender: 'agri-trader@geneva.ch',
    subject: 'Handysize Grain - Black Sea to Med',
    timestamp: '07:30Z',
    summary: 'Small bulk cargo for Handysize vessel.',
    classification: 'CARGO',
    category: 'DRY BULK',
    subCategory: 'Handysize',
    confidence: 91,
    rawBody: 'WHEAT IN BULK. 25,000 MT. LOAD: NOVOROSSIYSK. DISCH: ALEXANDRIA. LAYCAN: SPOT.',
    accountId: 'acc-1',
    provider: 'gmail'
  }
];
