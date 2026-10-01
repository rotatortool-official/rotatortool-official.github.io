// node scripts/lib/coin-universe.test.mjs
// The weekly selection rules, on a synthetic market. No network.
import assert from 'node:assert/strict';
import { RULES, selectUniverse, idsToFetch, validateUniverse, avgVolume } from './coin-universe.mjs';

const N = 400;
// coin i: market cap falls with i, volume $20M, a Binance pair at the same price.
const mk = (i, over = {}) => ({
  id: 'c' + i, symbol: 'C' + i, name: 'Coin ' + i, current_price: 1,
  market_cap: 1e12 / (i + 1), total_volume: 2e7, ...over,
});
const market = (patch = {}) => Array.from({ length: N }, (_, i) => mk(i, patch[i] || {}));
const binanceFor = (top) => new Map(top.map((c) => [c.symbol.toUpperCase(), c.current_price]));
const memes = [
  mk(1000, { id: 'm1', symbol: 'MA', total_volume: 9e7 }),
  mk(1001, { id: 'm2', symbol: 'MB', total_volume: 8e7 }),
  mk(1002, { id: 'm3', symbol: 'MC', total_volume: 7e7 }),
  mk(1003, { id: 'm4', symbol: 'MD', total_volume: 6e7 }),
  mk(3, { total_volume: 5e7 }),          // c3 is a meme inside the core
];
const run = (top, prev, extra = {}) => selectUniverse({
  top, memes, stableCat: [], copyCat: [], stableIds: ['tether'],
  binance: new Map([...binanceFor(top), ...binanceFor(memes)]),
  volumeDays: {}, prev, fallbackListed: [], now: new Date('2026-10-05T02:37:00Z'), ...extra,
});

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

t('first run: the first 250 survivors in market-cap order', () => {
  const r = run(market(), null);
  assert.equal(r.core.length, RULES.CORE_SIZE);
  assert.deepEqual(r.core.slice(0, 3), ['c0', 'c1', 'c2']);
  assert.equal(r.core[249], 'c249');
});

t('filters: no Binance pair, thin volume, unusual ticker, tokenised stock, wrapped', () => {
  const top = market({
    0: { symbol: 'NOPAIR' }, 1: { total_volume: 1e6 }, 2: { symbol: '牛来' },
    4: { id: 'tsla-xstock' }, 5: { name: 'Wrapped Bitcoin' },
  });
  const binance = binanceFor(top); binance.delete('NOPAIR');
  const r = run(top, null, { binance: new Map([...binance, ...binanceFor(memes)]) });
  assert.equal(r.excluded.c0, 'no_binance_usdt_pair');
  assert.equal(r.excluded.c1, 'volume_under_2m');
  assert.equal(r.excluded.c2, 'unusual_ticker');
  assert.equal(r.excluded['tsla-xstock'], 'tokenized_stock');
  assert.equal(r.excluded.c5, 'wrapped_or_staked');
  assert.ok(!r.core.includes('c0') && !r.core.includes('c1'));
});

t('a price far from Binance is a ticker collision, not the same coin', () => {
  const top = market();
  const binance = new Map([...binanceFor(top), ...binanceFor(memes)]); binance.set('C7', 3);
  assert.equal(run(top, null, { binance }).excluded.c7, 'binance_price_mismatch');
});

t('two ids on one ticker: the larger keeps it', () => {
  const r = run(market({ 9: { symbol: 'C8' } }), null);
  assert.equal(r.excluded.c9, 'ticker_taken');
  assert.ok(r.core.includes('c8'));
});

t('fillers: top 3 memes by volume outside the core, tagged; core memes tagged too', () => {
  const r = run(market(), null);
  assert.deepEqual(r.fillers, ['m1', 'm2', 'm3']);
  assert.equal(r.tags.m1, 'meme');
  assert.equal(r.tags.c3, 'meme');
});

t('hysteresis: a listed coin at rank 260 stays, one at 300 gets a strike', () => {
  const first = run(market(), null);
  // c240 drops to rank ~260, c245 to ~300.
  const r = run(market({ 240: { market_cap: 1e12 / 261 }, 245: { market_cap: 1e12 / 301 } }), first);
  assert.ok(r.core.includes('c240'), 'rank 260 is above 275');
  assert.ok(r.core.includes('c245'), 'one strike only');
  assert.equal(r.strikes.c245, 1);
  assert.equal(r.core.length, RULES.CORE_SIZE);
});

t('two runs below 275 in a row: out, and retired', () => {
  const first = run(market(), null);
  const drop = { 245: { market_cap: 1e12 / 301 } };
  const second = run(market(drop), first);
  const third = run(market(drop), second);
  assert.ok(!third.core.includes('c245'));
  assert.ok(third.removed.some((x) => x.id === 'c245' && x.reason === 'rank_below_275'));
  assert.ok(third.retired.some((x) => x.id === 'c245'));
  assert.equal(third.core.length, RULES.CORE_SIZE);
});

t('a recovered coin loses its strike', () => {
  const first = run(market(), null);
  const second = run(market({ 245: { market_cap: 1e12 / 301 } }), first);
  const third = run(market(), second);
  assert.ok(!('c245' in third.strikes));
});

t('a new coin joins only inside the top 240', () => {
  const first = run(market(), null);
  // c300 jumps to rank ~245: no room is made for it.
  const r = run(market({ 300: { market_cap: 1e12 / 245.5 } }), first);
  assert.ok(!r.core.includes('c300'));
  // c301 jumps to rank ~100: it joins and the lowest holdover is trimmed.
  const r2 = run(market({ 301: { market_cap: 1e12 / 100.5 } }), first);
  assert.ok(r2.core.includes('c301'));
  assert.ok(r2.added.includes('c301'));
  assert.equal(r2.core.length, RULES.CORE_SIZE);
});

t('a listed coin failing a filter leaves at once', () => {
  const first = run(market(), null);
  const r = run(market({ 10: { total_volume: 1e6 } }), first);
  assert.ok(!r.core.includes('c10'));
  assert.ok(r.removed.some((x) => x.id === 'c10' && x.reason === 'volume_under_2m'));
});

t('first run retires the old hand-written list, minus stables', () => {
  const r = run(market(), null, { fallbackListed: ['c0', 'gone-coin', 'tether'] });
  assert.ok(r.retired.some((x) => x.id === 'gone-coin' && x.reason === 'outside_fetched_ranks'));
  assert.ok(!r.retired.some((x) => x.id === 'tether' || x.id === 'c0'));
});

t('retired coins expire after RETIRE_WEEKS', () => {
  const prev = { ...run(market(), null), retired: [{ id: 'old', at: '2026-06-01T00:00:00Z', reason: 'x' }, { id: 'new', at: '2026-09-28T00:00:00Z', reason: 'x' }] };
  const r = run(market(), prev);
  assert.ok(!r.retired.some((x) => x.id === 'old'));
  assert.ok(r.retired.some((x) => x.id === 'new'));
});

t('the 7-day average replaces 24h only with 7 days stored', () => {
  const six = Object.fromEntries([1, 2, 3, 4, 5, 6].map((d) => ['2026-09-0' + d, { a: 1e6 }]));
  assert.deepEqual(avgVolume('a', 9e6, six), { usd: 9e6, basis: 'h24' });
  assert.deepEqual(avgVolume('a', 9e6, { ...six, '2026-09-07': { a: 1e6 } }), { usd: 1e6, basis: 'days7' });
});

t('fail safe: fewer than 200 coins is refused', () => {
  const top = market();
  const thin = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [i, { total_volume: 1e5 }]));
  const r = run(market(thin), null);
  assert.ok(validateUniverse(r).length > 0);
  assert.equal(validateUniverse(run(top, null)).length, 0);
});

t('the sync fetches core + fillers + stables + retired, once each', () => {
  const ids = idsToFetch({ core: ['a', 'b'], fillers: ['m'], stables: ['tether', 'a'], retired: [{ id: 'r' }] });
  assert.deepEqual(ids, ['a', 'b', 'm', 'tether', 'r']);
});

console.log(`\n${n} checks passed`);
