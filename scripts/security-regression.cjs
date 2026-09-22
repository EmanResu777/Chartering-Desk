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
  /match \/usage\/\{usageId\}[\s\S]{0,180}allow write: if false/.test(rules),
  'users must not be able to write billing/usage counters'
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

if (!process.exitCode) {
  console.log('Security regression gates passed.');
}
