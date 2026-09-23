import type { Email } from '../lib/utils';

export const DEV_DEMO_EMAILS: Email[] = [
  {
    id: 'DEV-MSG-001',
    sender: 'demo-broker@example.test',
    subject: 'DEV: Capesize Spot Cargo',
    timestamp: '09:42Z',
    summary: 'Development-only cargo example.',
    classification: 'CARGO',
    category: 'DRY BULK',
    subCategory: 'Capesize',
    confidence: 98,
    rawBody: 'DEV EXAMPLE ONLY: 150,000 MT iron ore, Durban / Rotterdam, laycan 15-25 Oct.',
    accountId: 'dev-gmail',
    provider: 'gmail'
  },
  {
    id: 'DEV-MSG-002',
    sender: 'demo-ops@example.test',
    subject: 'DEV: Open Tonnage',
    timestamp: '09:15Z',
    summary: 'Development-only vessel example.',
    classification: 'VESSEL',
    category: 'VESSEL POSITION',
    subCategory: 'Kamsarmax',
    confidence: 92,
    rawBody: 'DEV EXAMPLE ONLY: MV DEVELOPMENT, 82,000 DWT, open Dalian 12-15 Oct.',
    accountId: 'dev-outlook',
    provider: 'outlook'
  }
];
