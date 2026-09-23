const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error('PRODUCTION REGRESSION: ' + message);
    process.exitCode = 1;
  }
}

const server = read('server.ts');
const selectionDesk = read('src/components/SelectionDesk.tsx');
const cargoDesk = read('src/components/CargoDesk.tsx');
const vesselMonitor = read('src/components/VesselMonitor.tsx');
const inboxParser = read('src/components/InboxParser.tsx');
const appClient = read('src/App.tsx');
const workspaceContext = read('src/lib/WorkspaceContext.tsx');
const aisProvider = read('src/server/aisProvider.ts');
const smartRadar = read('src/components/SmartRadar.tsx');
const alertService = read('src/lib/alertService.ts');
const settingsClient = read('src/components/Settings.tsx');
const analyticsClient = read('src/components/Analytics.tsx');
const voyageEstimateModal = read('src/components/VoyageEstimateModal.tsx');
const routingProvider = read('src/lib/routingProvider.ts');
const documentEditor = read('src/components/DocumentEditor.tsx');

assert(!server.includes("testId123"), 'test-user authentication bypass must never ship');
assert(!server.includes("raw_commodity: raw_commodity || 'coil'"), 'deterministic parser must never invent COIL');
assert(
  server.includes("if (!raw_commodity) missing_fields.push('commodity')") &&
  server.includes("if (!quantity) missing_fields.push('quantity')") &&
  server.includes("if (!loadPort) missing_fields.push('loadPort')") &&
  server.includes("if (!dischargePort) missing_fields.push('dischargePort')") &&
  server.includes("if (!laycan) missing_fields.push('laycan')"),
  'deterministic parser must report missing commercial fields explicitly'
);
assert(
  server.includes("const operation = ROUTE_TASK_OPERATION[taskType]") &&
  server.includes("await checkCredits(verifiedUid, operation)") &&
  server.includes("await chargeCreditsAfterSuccess(verifiedUid, operation, reqId"),
  'generic AI router must be allowlisted and billed server-side'
);
assert(
  server.includes("await checkCredits(verifiedUid, 'routing_estimate')") &&
  server.includes("await chargeCreditsAfterSuccess(verifiedUid, 'routing_estimate'"),
  'routing provider usage must be credit-controlled'
);
assert(
  server.includes("Access denied to vessel source") &&
  server.includes("Access denied to cargo source") &&
  server.includes("Access denied to deal room source"),
  'routing requests must validate access to their claimed source entity'
);
assert(
  server.includes("usageEvents") &&
  server.includes("period: getCurrentUsagePeriod()"),
  'usage breakdown and events must use the same collection/period model'
);
assert(
  !server.includes("!checkRateLimit(uid) && !checkRateLimit(ip)") &&
  !server.includes("!checkRateLimit(verifiedUid) && !checkRateLimit(ip)"),
  'rate-limit bypass via AND logic must not return'
);

assert(
  !server.includes("x-request-id"),
  'client x-request-id must not control billing idempotency'
);
assert(
  server.includes("throw new Error('USAGE_RECORDING_FAILED')"),
  'successful paid operations must fail closed if usage accounting cannot be recorded'
);
assert(
  server.includes("safeErrorCode: 'CREDIT_LIMIT_EXCEEDED'") &&
  server.includes("currentUsed + cost > baseIncluded + additionalCredits"),
  'final usage transaction must enforce the credit ceiling atomically'
);
assert(
  server.includes("process.env.JSON_BODY_LIMIT || '1mb'"),
  'production JSON payloads must have a bounded default size'
);
assert(
  server.includes("app.set('query parser', 'simple')"),
  'public query strings must avoid the extended qs parser'
);
assert(
  server.includes("collection('billingState').doc('current')") &&
  server.includes("userRecord.metadata.creationTime") &&
  server.includes("billingStatus: activeTrial ? 'trial' : 'trial_expired'"),
  'trial eligibility must be account-bound to Firebase Auth creation time'
);
assert(
  server.includes("Unauthorized to use this vessel") &&
  server.includes("vesselData.sharedItemId"),
  'process-offer must authorize the selected vessel, including network sharing'
);
assert(
  !server.includes("urgencyScore: 80") &&
  !server.includes("matchScore: 90"),
  'manual process-offer must not fabricate match or urgency scores'
);
assert(
  server.includes("EMAIL_SYNC_MODE") &&
  server.includes("cloudtasks.googleapis.com") &&
  server.includes("verifyEmailSyncWorkerIdentity") &&
  !server.includes("jobResults = new Map"),
  'production email sync must use durable Cloud Tasks/Firestore state instead of in-memory results'
);
assert(
  server.includes("Billing is not configured.") &&
  server.includes("Billing plan price is not configured."),
  'production billing must fail closed instead of returning demo success'
);
assert(
  server.includes("checks.billing") &&
  server.includes("checks.emailSync") &&
  server.includes("checks.canonicalAppUrl"),
  'readiness must cover billing, durable email sync, and canonical URL configuration'
);
assert(
  server.includes("/multi-exec") &&
  server.includes("DISTRIBUTED_RATE_LIMIT_REQUIRED") &&
  server.includes("createHash('sha256').update(String(identifier))"),
  'multi-instance production rate limiting must use the distributed Redis backend'
);
assert(
  server.includes("checks.distributedRateLimit"),
  'readiness must fail when distributed rate limiting is required but unavailable'
);
assert(
  !server.includes("processOfferAnalysis"),
  'client-controlled deal brief flags must not bypass backend authorization'
);
assert(
  server.includes("Core cargo/vessel collections are private. Network exposure must go through sharedItems.") &&
  server.includes("itemData.createdByUid === uid") &&
  server.includes("itemData.visibility !== 'network'"),
  'deal brief authorization must follow private core data and market request boundaries'
);

assert(
  !selectionDesk.includes('process.env.GEMINI_API_KEY') &&
  selectionDesk.includes("taskType: 'calculate_voyage'") &&
  server.includes("calculate_voyage: 'freight_calc'"),
  'Selection Desk voyage calculation must use the authenticated server AI router'
);
assert(
  cargoDesk.includes("taskType: \"transport_specs\"") &&
  !cargoDesk.includes('operation: "analyze_risk"'),
  'Cargo transport intelligence must use the allowlisted AI router instead of a blocked generic operation'
);

assert(
  appClient.includes('overflow-x-auto no-scrollbar') &&
  cargoDesk.includes('bottom-[calc(5.25rem+env(safe-area-inset-bottom))]') &&
  vesselMonitor.includes('bottom-[calc(5.25rem+env(safe-area-inset-bottom))]') &&
  inboxParser.includes('w-[calc(100vw-2rem)] max-w-72'),
  'mobile navigation and key overlays must remain phone-safe'
);
assert(
  !workspaceContext.includes('trialEndsAt.setDate') &&
  !workspaceContext.includes('trialEndsAt: trialEndsAt'),
  'creating a workspace must never mint or extend trial eligibility'
);

assert(
  !aisProvider.includes('Math.random()') &&
  !aisProvider.includes('mock-ais-provider') &&
  aisProvider.includes('AIS provider endpoint is not configured'),
  'AIS provider must fail closed and never fabricate live vessel coordinates'
);
assert(
  !smartRadar.includes('Mock Vessel') &&
  !smartRadar.includes('mock-1790163048155') &&
  smartRadar.includes("collection(db, 'sharedItems')"),
  'Smart Radar must use real Desk Network data and never synthesize opportunities'
);
assert(
  inboxParser.includes("import.meta.env.DEV && import.meta.env.VITE_ALLOW_DEMO_DATA === 'true'") &&
  !inboxParser.includes('demo@gmail.com'),
  'Inbox demo data must be explicitly development-only'
);
assert(
  !alertService.includes("Panamax / USG") &&
  !alertService.includes("Need Recap confirm for APEX") &&
  !alertService.includes("Frontline / Cargill") &&
  alertService.includes("collection(db, 'watchlistMatches')"),
  'Daily digest must derive content from real user activity'
);
assert(
  !settingsClient.includes('AUTO_REPLY:') &&
  !settingsClient.includes('Math.random()') &&
  settingsClient.includes('MANUAL_APPROVAL_ONLY'),
  'Settings must not simulate automation or automatic outbound replies'
);
assert(
  !analyticsClient.includes('Math.random()') &&
  analyticsClient.includes('WORKSPACE DATA'),
  'Analytics must not fabricate live trends'
);
assert(
  voyageEstimateModal.includes('speedBallast: 0') &&
  voyageEstimateModal.includes('bunkerPrice: 0') &&
  voyageEstimateModal.includes('portCost: 0'),
  'Voyage estimates must not silently seed commercial assumptions'
);
assert(
  !routingProvider.includes('simulated_sea_route_fallback') &&
  routingProvider.includes("provider: 'unavailable'"),
  'routing provider errors must fail closed instead of returning simulated sea distances'
);
assert(
  !documentEditor.includes('Marina Petrova') &&
  !documentEditor.includes('James Wilson') &&
  !documentEditor.includes('BIMCO Verified') &&
  !documentEditor.includes('100% WITHIN 3 BANKING DAYS') &&
  !documentEditor.includes('FIOST 1/1') &&
  !documentEditor.includes('AS AGREED PDPR') &&
  documentEditor.includes('Human Review Required'),
  'document editor must not ship fictitious counterparties, unagreed charter terms, or false verification claims'
);
assert(
  !settingsClient.includes('Global Maritime Holdings') &&
  !settingsClient.includes('PACIFIC MATERIALS TRADING') &&
  !settingsClient.includes('John Harrison') &&
  settingsClient.includes('TBA / EXPRESS AGREEMENT REQUIRED'),
  'document settings must use neutral placeholders instead of fictitious commercial parties'
);

if (!process.exitCode) {
  console.log('Production regression gates passed.');
}
