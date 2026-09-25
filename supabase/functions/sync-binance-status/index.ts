// ============================================================
// sync-binance-status — Supabase Edge Function
//
// Flags coins whose Binance USDT pair is no longer actively trading
// (delisted, suspended, or in a pre/post-trading transition) so the
// site stops suggesting them as buy targets or rotation destinations.
//
// WHY THIS EXISTS:
// Reported directly: the rotation/buy suggestions were recommending a
// token that was being delisted on Binance — actively harmful advice
// from a tool built specifically around Binance-executable rotation
// (the swap calculator, ratio tool, and bStocks feature all assume
// Binance tradability). Nothing in the scoring pipeline ever checked
// real exchange listing status; FREE_COINS (config.js) is a static
// list that has no awareness of what Binance is currently doing.
//
// WHAT THIS DOES NOT CATCH:
// Binance announces upcoming delistings in advance via blog posts, not
// a structured API. A coin can be status='TRADING' today and scheduled
// for removal next week — this function has no way to see that
// announcement. It only catches symbols that have ALREADY moved out of
// TRADING status (BREAK, HALT, END_OF_DAY, etc.) — real protection
// against an already-broken pair, not a crystal ball for future
// announcements. Said plainly here rather than oversold as complete.
//
// ── SECOND JOB, added 2026-09-06: Binance's tag vocabulary ───
// Reported directly: rotation suggestions were surfacing SYN and GLMR.
// Both carry Binance's Monitoring Tag — the exchange's own marker for a
// token with materially higher volatility/risk that it reviews
// periodically for possible delisting. Both are still status='TRADING'.
//
// Measured the same day: 32 USDT pairs carry the tag and ALL 32 are
// TRADING, so the delisted check above caught exactly zero of them.
// That is the point — the Monitoring Tag is the state BETWEEN "fine"
// and "already broken", and it was invisible to this pipeline.
//
// SOURCE, and its caveat: the tag is NOT in /api/v3/exchangeInfo. It
// comes from the same endpoint the Binance website itself uses,
// bapi/asset/v2/public/asset-service/product/get-products, which is
// undocumented and unversioned. It can change shape or start refusing
// datacentre IPs without notice. So it is fetched SEPARATELY and its
// failure is caught SEPARATELY: if it breaks, the delisted sync above
// still completes and the response says monitoring_ok:false. It must
// never take the primary job down with it.
//
// It ingests the WHOLE tag vocabulary into binance_symbol_tags, not just
// Monitoring: the site hand-maintains 194 category assignments in
// config.js that duplicate tags Binance already publishes here. Seed and
// the rest are labels, not exclusions -- only Monitoring gates anything,
// via the binance_monitoring_symbols view.
//
// DATA SOURCE:
// GET /api/v3/exchangeInfo — single public call, weight 20, no auth.
// Filtered to <SYM>USDT pairs, since that's the quote pair convention
// already used everywhere else in this codebase (ratio.js, signal-
// history.js's _fetchKlines, sync-bstocks) — sym + 'USDT'.
//
// DEPLOY:
//   supabase functions deploy sync-binance-status
//   supabase secrets set BINANCE_STATUS_SYNC_SECRET=<own secret>
//
// SCHEDULE: once daily. See sql/sync_binance_status_cron.sql.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY          = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BINANCE_STATUS_SYNC_SECRET= Deno.env.get('BINANCE_STATUS_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

// The website's own product feed. Undocumented — see the header note.
const PRODUCTS_URL =
  'https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products';

// Exact tag string as Binance returns it, capital M. Verified against the
// live feed on 2026-09-06: 32 USDT pairs matched, including SYN and GLMR.
const MONITORING_TAG = 'Monitoring';

// ── ANNOUNCED DELISTINGS, added 2026-09-25 ─────────────────────
// The "does not catch" note in the header, answered by hand. Binance
// announces a delisting in a blog post, not an API, so a coin keeps
// status TRADING until the day it goes. For that stretch it is still
// eligible, and a buy suggestion for a coin with a known end date is the
// exact harm this function exists to prevent.
//
// Entries are written as status DELIST_ANNOUNCED, so they exclude from
// the BUY side only, like every other row here; a held coin is still
// shown. Once the date passes exchangeInfo takes over (BREAK, then
// NOT_LISTED), and the entry can be deleted, though it is harmless to
// leave it.
//
// Only add a coin from Binance's own announcement.
const ANNOUNCED_DELISTINGS: { base: string; date: string; note: string }[] = [
  // STG/USDT spot delists 2026-10-06 11:00 UTC; deposits/withdrawals stop
  // 11:30. Stargate merges into LayerZero at a fixed 1 STG = 0.08634 ZRO,
  // which valued STG ~32% below market when announced. The perps settled
  // 2026-09-24. Binance converts balances for its users.
  { base: 'STG', date: '2026-10-06', note: 'STG -> ZRO merger, fixed ratio' },
];

// ── ...and read from Binance's announcement feed, added 2026-09-25 ──
// The hand list above only works if someone remembers. Binance's
// announcements page is fed by a JSON list endpoint (undocumented, same
// caveat as get-products). Two title shapes mean a coin is going away:
//
//   Delisting catalog (161):
//     "Binance Will Delist ICX, SCRT, STORJ on 2026-09-03"
//   Maintenance catalog (157):
//     "Binance Will Support the Stargate Finance (STG) Token Merge to
//      LayerZero (ZRO)"
//
// Deliberately NOT matched: "Binance Margin And Loan Will Delist ...",
// "Binance Alpha Will Remove ...", "Notice of Removal of Spot Trading
// Pairs" (single pairs such as XXX/BTC, not the coin), "Network
// Migration" and "Contract Swap" (the coin carries on; KITE had one).
//
// A dated delisting is kept until its date passes; after that exchangeInfo
// says BREAK and then NOT_LISTED on its own. A merge title carries no date,
// so it is kept for MERGE_WINDOW_DAYS from the announcement. That is longer
// than any merge notice-to-delist gap seen so far (STG: 18 days).
//
// FAILS SAFE: if the feed breaks, the hand list still applies and the
// response says announcements_ok:false. Nothing is ever un-excluded
// because this feed failed; it only ever adds rows.
const CMS_LIST_URL = (catalogId: number) =>
  'https://www.binance.com/bapi/composite/v1/public/cms/article/list/query'
  + `?type=1&catalogId=${catalogId}&pageNo=1&pageSize=50`;
const MERGE_WINDOW_DAYS = 60;

type Announced = { base: string; date: string; note: string };

// Pure, so it can be tested against real titles.
function parseAnnouncement(title: string, releasedMs: number, todayIso: string): Announced[] {
  const released = new Date(releasedMs).toISOString().slice(0, 10);
  const del = title.match(/^Binance Will Delist (.+?) on (\d{4}-\d{2}-\d{2})\b/);
  if (del) {
    const date = del[2];
    if (date < todayIso) return [];
    return del[1]
      .split(/,|\band\b|&/)
      .map((t) => t.replace(/\(.*?\)/g, '').trim())
      .filter((t) => /^[A-Z0-9]{1,15}$/.test(t))
      .map((base) => ({ base, date, note: title }));
  }
  const merge = title.match(/^Binance Will Support the .*?\(([A-Z0-9]{1,15})\) Token Merge\b/);
  if (merge) {
    const until = new Date(releasedMs + MERGE_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
    if (until < todayIso) return [];
    return [{ base: merge[1], date: released, note: title }];
  }
  return [];
}

async function fetchAnnouncedDelistings(): Promise<Announced[]> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const out: Announced[] = [];
  for (const catalogId of [161, 157]) {
    const res = await fetch(CMS_LIST_URL(catalogId), { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`cms catalog ${catalogId} -> HTTP ${res.status}`);
    const j = await res.json();
    const articles: { title?: string; releaseDate?: number }[] = j?.data?.catalogs?.[0]?.articles ?? [];
    if (!Array.isArray(articles) || !articles.length) {
      throw new Error(`cms catalog ${catalogId} returned no articles (shape may have changed)`);
    }
    for (const a of articles) {
      if (typeof a.title === 'string' && typeof a.releaseDate === 'number') {
        out.push(...parseAnnouncement(a.title, a.releaseDate, todayIso));
      }
    }
  }
  return out;
}

// Shape of one row from get-products. Terse single-letter keys are
// Binance's, not ours: s=symbol, b=base, q=quote, st=status.
interface BinanceProduct {
  s: string;
  b: string;
  q: string;
  st: string;
  tags?: string[];
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!BINANCE_STATUS_SYNC_SECRET || token !== BINANCE_STATUS_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    if (!res.ok) throw new Error(`exchangeInfo -> HTTP ${res.status}`);
    const json = await res.json();
    const symbols: BinanceSymbol[] = json.symbols || [];

    // Only USDT pairs — the quote asset convention used everywhere else
    // in this codebase. A coin with e.g. a BUSD or BTC pair still active
    // but its USDT pair broken is exactly the "can't execute the
    // suggested trade" case we're protecting against.
    const usdtPairs = symbols.filter((s) => s.quoteAsset === 'USDT');

    // Store ONLY the non-trading ones — smaller table, clearer semantics
    // ("appears here" = "known problem"), and fails safe: if this sync
    // itself breaks, the table just goes stale rather than the site
    // wrongly excluding every coin because the "known-good" list didn't
    // load.
    const notTrading = usdtPairs
      .filter((s) => s.status !== 'TRADING')
      .map((s) => ({
        base_asset: s.baseAsset,
        binance_symbol: s.symbol,
        status: s.status,
        checked_at: new Date().toISOString()
      }));

    // ── NOT_LISTED, added 2026-09-25 ─────────────────────────────
    // The filter above only sees pairs that are still IN exchangeInfo.
    // Binance drops a delisted pair from exchangeInfo entirely some time
    // after it stops trading, and a coin that never had a USDT pair was
    // never in it at all. Neither ever reached this table, so both stayed
    // eligible. Measured on run 1934: 20 of 182 eligible coins had no
    // USDT pair on Binance under any status (OKB, KAS, MNT, FLR, AKT,
    // POPCAT, RON, ...), and the swap tool cannot execute any of them.
    //
    // So every universe coin whose symbol has no USDT pair at all is
    // written here too, as status NOT_LISTED. Same table, so every
    // existing consumer inherits it without a change: the engine's
    // `delisted` eligibility reason, the page's buy-side filter and its
    // "NOT TRADING ON BINANCE" badge. The status column says which kind
    // of row it is.
    //
    // The universe is read from cg_markets_all, whose `symbol` is the
    // exact string the engine and the page key on (uppercased). It FAILS
    // OPEN: an unreadable cache, or an exchangeInfo too small to be real,
    // adds no rows rather than flagging everything.
    const listedBases = new Set(usdtPairs.map((s) => s.baseAsset));
    let notListed: typeof notTrading = [];
    let notListedOk = true;
    let notListedErr: string | null = null;
    try {
      if (usdtPairs.length < 300) {
        throw new Error(`only ${usdtPairs.length} USDT pairs in exchangeInfo — too few to trust an absence`);
      }
      const { data: mRow, error: mErr } = await supabase
        .from('market_cache').select('data').eq('cache_key', 'cg_markets_all').maybeSingle();
      if (mErr) throw new Error('cg_markets_all read failed: ' + mErr.message);
      const markets: { id: string; symbol: string }[] = Array.isArray(mRow?.data) ? mRow!.data : [];
      if (markets.length < 100) throw new Error(`cg_markets_all has ${markets.length} rows — too few to trust`);
      const seen = new Set<string>();
      const now = new Date().toISOString();
      for (const c of markets) {
        const sym = String(c.symbol || '').toUpperCase();
        // bStocks are a separate universe with their own feed; USDT is
        // the quote asset itself, so it can never have a USDT pair.
        if (!sym || sym === 'USDT' || String(c.id).startsWith('bstock_')) continue;
        if (listedBases.has(sym) || seen.has(sym)) continue;
        seen.add(sym);
        notListed.push({ base_asset: sym, binance_symbol: sym + 'USDT', status: 'NOT_LISTED', checked_at: now });
      }
    } catch (e) {
      notListed = [];
      notListedOk = false;
      notListedErr = e instanceof Error ? e.message : String(e);
      console.error('[sync-binance-status] not-listed check skipped:', notListedErr);
    }

    // Replace the table wholesale each run — a symbol that returns to
    // TRADING status (relisted, or was a temporary HALT) should stop
    // being flagged, not linger forever from a stale row.
    const { error: delErr } = await supabase.from('binance_delisted_symbols').delete().neq('base_asset', '');
    if (delErr) throw new Error('clear failed: ' + delErr.message);

    // A base already flagged by exchangeInfo keeps that row: a real
    // status beats an announcement.
    let fromFeed: Announced[] = [];
    let announcementsOk = true;
    let announcementsErr: string | null = null;
    try {
      fromFeed = await fetchAnnouncedDelistings();
    } catch (e) {
      announcementsOk = false;
      announcementsErr = e instanceof Error ? e.message : String(e);
      console.error('[sync-binance-status] announcement feed failed:', announcementsErr);
    }
    const flaggedBases = new Set([...notTrading, ...notListed].map((r) => r.base_asset));
    const announcedBases = new Set<string>();
    const announced = [...ANNOUNCED_DELISTINGS, ...fromFeed]
      .filter((a) => !flaggedBases.has(a.base) && !announcedBases.has(a.base) && announcedBases.add(a.base))
      .map((a) => ({
        base_asset: a.base,
        binance_symbol: a.base + 'USDT',
        status: 'DELIST_ANNOUNCED',
        checked_at: new Date().toISOString(),
      }));

    const rows = [...notTrading, ...notListed, ...announced];
    for (let i = 0; i < rows.length; i += 200) {
      const { error: insErr } = await supabase.from('binance_delisted_symbols').insert(rows.slice(i, i + 200));
      if (insErr) throw new Error('insert failed: ' + insErr.message);
    }

    // ── Binance tags, isolated from everything above ───────────
    // Its own try/catch on purpose: an undocumented endpoint must not be
    // able to fail the delisted sync that has already succeeded.
    type TaggedRow = { base_asset: string; binance_symbol: string; tags: string[] };
    let tagged: TaggedRow[] = [];
    let monitoring: TaggedRow[] = [];
    let monitoringOk = true;
    let monitoringErr: string | null = null;
    try {
      const pRes = await fetch(PRODUCTS_URL, {
        headers: { 'Accept': 'application/json' },
      });
      if (!pRes.ok) throw new Error(`get-products -> HTTP ${pRes.status}`);
      const pJson = await pRes.json();
      const products: BinanceProduct[] = pJson?.data ?? [];
      if (!Array.isArray(products) || !products.length) {
        throw new Error('get-products returned no data (shape may have changed)');
      }

      // Every tagged USDT pair, not just the Monitoring ones. Binance
      // publishes its whole category vocabulary on this one feed, and the
      // site has been hand-maintaining 194 of these assignments in
      // config.js where they can drift. One ingest, three consumers:
      // category tabs, the Monitoring exclusion, and informational labels
      // like Seed (higher volatility -- which cuts both ways, so it is
      // labelled, never excluded).
      tagged = products
        .filter((p) => p.q === 'USDT' && Array.isArray(p.tags) && p.tags.length > 0)
        .map((p) => ({
          base_asset: p.b,
          binance_symbol: p.s,
          tags: p.tags,
        }));

      monitoring = tagged.filter((t) => t.tags.includes(MONITORING_TAG));

      // A zero-length result is far more likely to mean "they renamed the
      // tag" than "Binance cleared all 32 overnight". Treating it as a
      // real result would silently un-exclude everything, which is the
      // exact failure this whole change exists to prevent.
      if (!monitoring.length) throw new Error('no Monitoring-tagged USDT pairs found — tag name likely changed');

      const { error: tDelErr } = await supabase
        .from('binance_symbol_tags').delete().neq('base_asset', '');
      if (tDelErr) throw new Error('tags clear failed: ' + tDelErr.message);

      // Chunked: ~490 tagged pairs is past the point where a single
      // PostgREST insert is comfortable.
      for (let i = 0; i < tagged.length; i += 200) {
        const { error: tInsErr } = await supabase
          .from('binance_symbol_tags').insert(tagged.slice(i, i + 200));
        if (tInsErr) throw new Error('tags insert failed: ' + tInsErr.message);
      }
    } catch (e) {
      // Leave the previous rows in place. Stale exclusions are safe;
      // an empty table would silently start recommending flagged coins.
      monitoringOk = false;
      monitoringErr = e instanceof Error ? e.message : String(e);
      console.error('[sync-binance-status] monitoring tag sync failed:', monitoringErr);
    }

    return new Response(
      JSON.stringify({
        checked: usdtPairs.length,
        flagged: notTrading.length,
        flagged_symbols: notTrading.map((s) => s.base_asset),
        not_listed_ok: notListedOk,
        not_listed: notListed.length,
        not_listed_symbols: notListed.map((s) => s.base_asset),
        ...(notListedErr ? { not_listed_error: notListedErr } : {}),
        delist_announced: announced.map((a) => a.base_asset),
        announcements_ok: announcementsOk,
        announcements_from_feed: fromFeed.map((a) => `${a.base} (${a.date})`),
        ...(announcementsErr ? { announcements_error: announcementsErr } : {}),
        monitoring_ok: monitoringOk,
        tagged_symbols: monitoringOk ? tagged.length : null,
        monitoring_flagged: monitoringOk ? monitoring.length : null,
        monitoring_symbols: monitoringOk ? monitoring.map((m) => m.base_asset) : null,
        ...(monitoringErr ? { monitoring_error: monitoringErr } : {}),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync-binance-status] failed:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
