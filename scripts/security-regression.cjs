const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`SECURITY REGRESSION: ${message}`);
    process.exitCode = 1;
  }
}

const vite = read('vite.config.ts');
const assistant = read('src/components/AIAssistant.tsx');
const authClient = read('src/lib/googleAuth.ts');
const server = read('server.ts');
const rules = read('firestore.rules');

assert(!vite.includes('process.env.GEMINI_API_KEY'), 'Vite must not inject GEMINI_API_KEY into the browser');
assert(!assistant.includes('process.env.GEMINI_API_KEY'), 'frontend must not depend on GEMINI_API_KEY');
assert(server.includes("collection('_oauth_states')"), 'OAuth must use server-side one-time state');
assert(!/ADMIN_EMAILS\s*\|\|\s*'[^']+'/.test(server), 'admin access must not have a hard-coded email fallback');
assert(server.includes("APP_BASE_URL must be configured in production"), 'production redirects must use a configured canonical origin');
assert(authClient.includes('event.origin !== window.location.origin'), 'OAuth popup messages must validate origin');
assert(authClient.includes('event.source !== authWindow'), 'OAuth popup messages must validate source');

assert(
  !/const safeTokens\s*=\s*\{[\s\S]{0,120}access_token/.test(server),
  'OAuth callback must not embed access tokens in HTML/postMessage payloads'
);
assert(
  server.includes("refreshTokenEncrypted: encryptCredential(tokens.refresh_token)") &&
  server.includes("passwordEncrypted: encryptCredential(password)"),
  'email account secrets must be encrypted before Firestore storage'
);
assert(
  server.includes("process.env.EMAIL_WEBHOOK_SECRET") &&
  server.includes("x-email-webhook-secret") &&
  server.includes("constantTimeSecretEquals"),
  'incoming email webhook must require a server-side secret'
);
assert(
  server.includes("resolveSafeImapHost") &&
  server.includes("Only secure IMAPS on port 993 is supported."),
  'IMAP connections must block arbitrary internal hosts/ports'
);
assert(
  !server.includes("!checkRateLimit(verifiedUid) && !checkRateLimit(ip)"),
  'per-user or per-IP rate limit exhaustion must block the request'
);
assert(
  server.includes("const isOwner = vesselData.userId === verifiedUid"),
  'AIS access must use the canonical vessel owner field'
);

assert(
  /match \/usage\/\{usageId\}[\s\S]{0,180}allow write: if false/.test(rules),
  'users must not be able to write billing/usage counters'
);
assert(
  /match \/billingState\/\{stateId\}[\s\S]{0,180}allow read, write: if false/.test(rules),
  'users must not be able to read or write server billing state'
);
assert(
  /match \/emailAccounts\/\{accountId\}[\s\S]{0,180}allow read, write: if false/.test(rules),
  'OAuth and IMAP account secrets must be server-only'
);
assert(
  rules.includes("email == request.auth.token.email.lower()") &&
  rules.includes("incoming().uid == request.auth.uid"),
  'email-to-UID mapping must be bound to the verified authenticated email'
);
assert(
  !/match \/memberships\/\{workspaceId\}[\s\S]{0,350}allow write: if isSignedIn\(\)[\s\S]{0,100}request\.auth\.uid == userId/.test(rules),
  'users must not be able to self-grant arbitrary workspace memberships'
);

for (const [resource, id] of [
  ['vessels', 'vesselId'],
  ['cargos', 'cargoId'],
  ['contacts', 'contactId'],
  ['emails', 'emailId'],
]) {
  const block = new RegExp(`match /${resource}/\\{${id}\\}[\\s\\S]{0,1000}`).exec(rules)?.[0] || '';
  assert(
    block.includes('incoming().userId == request.auth.uid'),
    `${resource} creates must bind userId to the authenticated user`
  );
  assert(
    block.includes('incoming().userId == existing().userId'),
    `${resource} updates must keep userId immutable`
  );
}

assert(
  /match \/incoming_webhooks\/\{webhookId\}[\s\S]{0,140}allow read, write: if false/.test(rules),
  'incoming webhook payloads must remain backend-only'
);
assert(
  rules.includes('incoming().ownerId == existing().ownerId'),
  'workspace ownerId must be immutable through client rules'
);
assert(
  rules.includes("'participantUids', 'participantDeskIds'") &&
  rules.includes("'visibility', 'linkedCargoId', 'linkedVesselId'") &&
  rules.includes("'sourceType', 'sourceId', 'dealRoomId', 'cargoId', 'vesselId'"),
  'participants must not be able to rewrite Deal Room or voyage-estimate ACL/source fields'
);
assert(
  rules.includes("function isValidMarketMatchCreate(data)") &&
  /match \/marketMatches\/\{matchId\}[\s\S]{0,5000}allow update: if false;/.test(rules) &&
  rules.includes("data.vesselOwnerUid == request.auth.uid") &&
  rules.includes("data.cargoOwnerUid == counterpartUid"),
  'market matches must require authentic participant mapping and remain immutable from clients'
);
assert(
  rules.includes("incoming().get('recipientUid', null) == existing().get('recipientUid', null)") &&
  rules.includes("incoming().get('recipientDeskId', null) == existing().get('recipientDeskId', null)"),
  'alert recipients must remain immutable during client updates'
);
assert(
  rules.includes("existing().createdByUid == request.auth.uid;") &&
  rules.includes("!incoming().diff(existing()).affectedKeys().hasAny(['createdByUid', 'createdByDeskId', 'visibility'])"),
  'shared counterparties must preserve ownership and ACL fields'
);

assert(
  rules.includes("incoming().get('verifiedCompany', false) == existing().get('verifiedCompany', false)"),
  'clients must not self-verify company profiles'
);

assert(
  rules.includes("incoming().get('confirmations', {}).get('cargoSide', {}).get('confirmedBy', null)") &&
  rules.includes("incoming().get('confirmations', {}).get('vesselSide', {}).get('confirmedBy', null)") &&
  rules.includes("incoming().status == 'locked'") &&
  rules.includes("incoming().get('confirmationStatus', '') == 'confirmed_by_both_sides'"),
  'recap lock must require authentic confirmation identities from both deal sides'
);

if (!process.exitCode) {
  console.log('Security regression gates passed.');
}
