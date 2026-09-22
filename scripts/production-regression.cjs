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
  !server.includes("processOfferAnalysis"),
  'client-controlled deal brief flags must not bypass backend authorization'
);
assert(
  server.includes("Core cargo/vessel collections are private. Network exposure must go through sharedItems.") &&
  server.includes("itemData.createdByUid === uid") &&
  server.includes("itemData.visibility !== 'network'"),
  'deal brief authorization must follow private core data and market request boundaries'
);

if (!process.exitCode) {
  console.log('Production regression gates passed.');
}
