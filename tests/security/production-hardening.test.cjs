const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');

test('Gemini server secret is never injected by Vite', () => {
  const vite = read('vite.config.ts');
  assert.equal(vite.includes("'process.env.GEMINI_API_KEY'"), false);
  assert.equal(vite.includes('loadEnv('), false);
});

test('Gmail OAuth is server-bound and popup messages validate origin', () => {
  const server = read('server.ts');
  const googleAuth = read('src/lib/googleAuth.ts');

  assert.equal(server.includes("collection('_oauth_states')"), true);
  assert.equal(server.includes('Buffer.from(JSON.stringify({ redirectUri, userId }))'), false);
  assert.equal(googleAuth.includes('event.origin !== window.location.origin'), true);
  assert.equal(googleAuth.includes('event.source !== authWindow'), true);
});

test('admin access has no hard-coded fallback identity', () => {
  const server = read('server.ts');
  assert.equal(server.includes("process.env.ADMIN_EMAILS || '"), false);
  assert.match(server, /Forbidden: Admin only/);
});

test('market values fail closed instead of pretending simulated data is live', () => {
  const provider = read('src/server/marketProvider.ts');
  assert.match(provider, /No licensed live market data provider is configured/);
  assert.match(provider, /ALLOW_SIMULATED_MARKET_DATA/);
  assert.match(provider, /isSimulated: true/);
});
