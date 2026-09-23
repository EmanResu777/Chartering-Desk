import test from 'node:test';
import assert from 'node:assert/strict';

test('market reference data is explicitly simulated in non-production', async () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'test';
  process.env.MARKET_REFERENCE_MODE = 'true';
  process.env.ALLOW_SIMULATED_MARKET_DATA = 'false';
  delete process.env.MARKET_SNAPSHOT_URL;
  delete process.env.BUNKER_SNAPSHOT_URL;

  const provider = await import('../../src/server/marketProvider.ts');
  const market = await provider.getMarketSnapshot();
  const bunkers = await provider.getBunkerSnapshot();

  assert.equal(market.available, true);
  assert.equal(market.isSimulated, true);
  assert.match(market.source, /simulated/);
  assert.ok(market.indices.length >= 5);
  assert.equal(bunkers.available, true);
  assert.equal(bunkers.isSimulated, true);
  assert.ok(bunkers.prices.some(p => p.portCode === 'SGSIN' && p.fuelType === 'vlsfo'));

  process.env = previous;
});

test('production refuses simulated market data unless explicitly allowed', async () => {
  const previous = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.MARKET_REFERENCE_MODE = 'true';
  process.env.ALLOW_SIMULATED_MARKET_DATA = 'false';
  delete process.env.MARKET_SNAPSHOT_URL;
  delete process.env.BUNKER_SNAPSHOT_URL;

  const provider = await import('../../src/server/marketProvider.ts');
  const market = await provider.getMarketSnapshot();
  const bunkers = await provider.getBunkerSnapshot();

  assert.equal(market.available, false);
  assert.equal(market.isSimulated, false);
  assert.equal(bunkers.available, false);
  assert.equal(bunkers.isSimulated, false);

  process.env = previous;
});
