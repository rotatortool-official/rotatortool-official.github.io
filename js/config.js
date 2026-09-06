/* ══════════════════════════════════════════════════════════════════
   config.js  —  All lists, settings & codes you'll want to edit
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE COINS:        Edit FREE_COINS list
   • ADD/REMOVE bSTOCKS:      Edit BSTOCK_LIST (Binance tokenized equities —
                              forex removed, see rotator-bstocks-migration-plan.md)
   • ADD PRO CODES:           Run an INSERT in Supabase (pro_codes table) —
                              codes live server-side, see sql/pro_codes_table.sql
   • UPDATE DONATION GOAL:    Change DONATION_GOAL and DONATION_CURRENT
   • UPDATE TOKENOMICS:       Edit TOKENOMICS_DB
══════════════════════════════════════════════════════════════════ */

/* ── Crypto coin lists ───────────────────────────────────────────── */
var FREE_COINS = [
  /* ── Mega caps ── */
  'bitcoin','ethereum','binancecoin','solana','ripple',
  /* ── Large caps ── */
  'dogecoin','cardano','avalanche-2','shiba-inu','chainlink',
  'polkadot','bitcoin-cash','near','litecoin','uniswap',
  'internet-computer','ethereum-classic','stellar','monero','okb',
  /* ── Mid caps ── */
  'hedera-hashgraph','filecoin','cosmos','vechain','tron',
  'sui','aptos','sei-network','render-token','jupiter-exchange-solana',
  /* ── DeFi ── */
  'aave','the-graph','curve-dao-token','maker','lido-dao',
  /* ── L2 & Infrastructure ── */
  'arbitrum','optimism','stacks','immutable-x','injective-protocol',
  /* ── Meme & Emerging ── */
  'blur','bonk','dogwifcoin','book-of-meme','pepe',
  /* ── RWA & New ── */
  'ondo-finance','worldcoin-wld','pyth-network','jito-governance-token','ethena',
  /* ── Batch 51–100 ── */
  'hyperliquid','toncoin','the-sandbox','decentraland','axie-infinity',
  'gala','illuvium','stepn','flow','wax',
  'ocean-protocol','fetch-ai','singularitynet','numeraire','bittensor',
  'zetachain','celestia','dymension','altlayer','omni-network',
  'saga-2','manta-network','mew','nyan-heroes','parcl',
  'io-net','kamino','meteora','drift-protocol','marginfi',
  'raydium','orca','lifinity','saber','serum',
  'wormhole','layerzero','across-protocol','synapse-2','stargate-finance',
  'gmx','gains-network','kwenta','polynomial-protocol','vertex-protocol',
  'pendle','spectra-finance','time-wonderland','convex-finance','frax-share',
  /* ── Batch 101–150: more L1s, gaming, AI, privacy ── */
  'kaspa','mantle','flare-networks','kava','zilliqa',
  'harmony','celo','moonbeam','astar','fantom',
  'theta-token','enjincoin','gods-unchained','ultra','treasure-lol',
  'ronin','beam-2','echelon-prime','myria','xai-blockchain',
  'arkham','dextools','mask-network','1inch','sushi',
  'pancakeswap-token','thorchain','osmosis','kujira','neutron-3',
  'akash-network','arweave','livepeer','theta-fuel','helium',
  'quant-network','algorand','elrond-erd-2','iota','eos',
  'neo','qtum','waves','conflux-token','icon',
  /* ── Batch 151–200: DeFi, stables, bridges, memes, infra ── */
  'compound-governance-token','yearn-finance','ribbon-finance','morpho','euler',
  'balancer','rocket-pool','frax-ether','ankr','ssv-network',
  'oasis-network','secret','nucypher','keep-network','hopr',
  'floki','cat-in-a-dogs-world','popcat','brett','turbo-eth',
  'memecoin','neiro-on-eth','toshi','ponke','wen-4',
  'jup','magic-eden','tensor','marinade','sanctum-2',
  'polymarket','grass','nosana','shadow-token','hivemapper',
  'mantra-dao','reserve-rights-token','maple-finance','clearpool','centrifuge',
  /* ── Stablecoins — shown with APR instead of % change ── */
  'tether','usd-coin','dai','first-digital-usd','true-usd',
  'ethena-usde','frax','paypal-usd','gemini-dollar','usdd'
];

var PRO_EXTRA_COINS = []; /* All 200 in free tier — Pro reserved for future expansion */

/* ── Coin category map ───────────────────────────────────────────
   Each coin ID → category tag.  Used by the leaderboard filter tabs.
   Coins not listed here default to 'other'.
   Categories: l1, defi, l2, meme, ai, gaming, rwa, infra, stable
──────────────────────────────────────────────────────────────────── */
var COIN_CATEGORIES = {
  /* ── L1 / Major chains ── */
  'bitcoin':'l1','ethereum':'l1','binancecoin':'l1','solana':'l1','ripple':'l1',
  'cardano':'l1','avalanche-2':'l1','polkadot':'l1','bitcoin-cash':'l1',
  'near':'l1','litecoin':'l1','internet-computer':'l1','ethereum-classic':'l1',
  'stellar':'l1','monero':'l1','hedera-hashgraph':'l1','cosmos':'l1',
  'vechain':'l1','tron':'l1','sui':'l1','aptos':'l1','sei-network':'l1',
  'toncoin':'l1','kaspa':'l1','flare-networks':'l1','kava':'l1','zilliqa':'l1',
  'harmony':'l1','celo':'l1','fantom':'l1','algorand':'l1','elrond-erd-2':'l1',
  'iota':'l1','eos':'l1','neo':'l1','qtum':'l1','waves':'l1','conflux-token':'l1',
  'icon':'l1','filecoin':'l1','quant-network':'l1',
  /* ── DeFi ── */
  'aave':'defi','uniswap':'defi','the-graph':'defi','curve-dao-token':'defi',
  'maker':'defi','lido-dao':'defi','jupiter-exchange-solana':'defi',
  'raydium':'defi','orca':'defi','lifinity':'defi','saber':'defi',
  'gmx':'defi','gains-network':'defi','kwenta':'defi','polynomial-protocol':'defi',
  'vertex-protocol':'defi','pendle':'defi','spectra-finance':'defi',
  'time-wonderland':'defi','convex-finance':'defi','frax-share':'defi',
  'compound-governance-token':'defi','yearn-finance':'defi','ribbon-finance':'defi',
  'morpho':'defi','euler':'defi','balancer':'defi','rocket-pool':'defi',
  'frax-ether':'defi','ankr':'defi','ssv-network':'defi',
  '1inch':'defi','sushi':'defi','pancakeswap-token':'defi','thorchain':'defi',
  'osmosis':'defi','kujira':'defi','neutron-3':'defi',
  'kamino':'defi','meteora':'defi','drift-protocol':'defi','marginfi':'defi',
  'jup':'defi','serum':'defi',
  /* ── L2 & Infrastructure ── */
  'arbitrum':'l2','optimism':'l2','stacks':'l2','immutable-x':'l2',
  'injective-protocol':'l2','manta-network':'l2','zetachain':'l2',
  'celestia':'l2','dymension':'l2','altlayer':'l2','omni-network':'l2',
  'saga-2':'l2','moonbeam':'l2','astar':'l2',
  /* ── Bridges & Interop ── */
  'wormhole':'l2','layerzero':'l2','across-protocol':'l2','synapse-2':'l2',
  'stargate-finance':'l2',
  /* ── Meme ── */
  'dogecoin':'meme','shiba-inu':'meme','pepe':'meme','bonk':'meme',
  'dogwifcoin':'meme','book-of-meme':'meme','blur':'meme','floki':'meme',
  'cat-in-a-dogs-world':'meme','popcat':'meme','brett':'meme','turbo-eth':'meme',
  'memecoin':'meme','neiro-on-eth':'meme','toshi':'meme','ponke':'meme',
  'wen-4':'meme','mew':'meme','nyan-heroes':'meme',
  /* ── AI ── */
  'ocean-protocol':'ai','fetch-ai':'ai','singularitynet':'ai','numeraire':'ai',
  'bittensor':'ai','arkham':'ai','render-token':'ai','nosana':'ai','io-net':'ai',
  /* ── Gaming ── */
  'the-sandbox':'gaming','decentraland':'gaming','axie-infinity':'gaming',
  'gala':'gaming','illuvium':'gaming','stepn':'gaming','flow':'gaming','wax':'gaming',
  'theta-token':'gaming','enjincoin':'gaming','gods-unchained':'gaming',
  'ultra':'gaming','treasure-lol':'gaming','ronin':'gaming','beam-2':'gaming',
  'echelon-prime':'gaming','myria':'gaming','xai-blockchain':'gaming',
  /* ── RWA ── */
  'ondo-finance':'rwa','worldcoin-wld':'rwa','mantra-dao':'rwa',
  'reserve-rights-token':'rwa','maple-finance':'rwa','clearpool':'rwa',
  'centrifuge':'rwa',
  /* ── Infra / DePIN / Data ── */
  'chainlink':'infra','pyth-network':'infra','okb':'infra',
  'jito-governance-token':'infra','ethena':'infra','hyperliquid':'infra',
  'akash-network':'infra','arweave':'infra','livepeer':'infra',
  'theta-fuel':'infra','helium':'infra','oasis-network':'infra',
  'secret':'infra','nucypher':'infra','keep-network':'infra','hopr':'infra',
  'dextools':'infra','mask-network':'infra','parcl':'infra',
  'magic-eden':'infra','tensor':'infra','marinade':'infra','sanctum-2':'infra',
  'polymarket':'infra','grass':'infra','shadow-token':'infra','hivemapper':'infra',
  /* ── Stablecoins ── */
  'tether':'stable','usd-coin':'stable','dai':'stable','first-digital-usd':'stable',
  'true-usd':'stable','ethena-usde':'stable','frax':'stable','paypal-usd':'stable',
  'gemini-dollar':'stable','usdd':'stable'
};

/* Category display config — order matters for tab rendering.
   'stocks' filters to bStock rows only, same tab row as crypto categories
   (not a separate top-nav mode — see migration plan Step 2). */
var CATEGORY_LIST = [
  {key:'all',    label:'ALL',     icon:'🌐'},
  {key:'l1',     label:'L1',      icon:'⛓'},
  {key:'defi',   label:'DEFI',    icon:'🏦'},
  {key:'l2',     label:'L2',      icon:'🔗'},
  {key:'meme',   label:'MEME',    icon:'🐸'},
  {key:'ai',     label:'AI',      icon:'🤖'},
  {key:'gaming', label:'GAMING',  icon:'🎮'},
  {key:'rwa',    label:'RWA',     icon:'🏠'},
  {key:'infra',  label:'INFRA',   icon:'🛠'},
  {key:'stable', label:'STABLE',  icon:'💵'},
  {key:'stocks', label:'STOCKS',  icon:'🏛'}
];

/* Get coin IDs for a specific category (or all if 'all').
   NOTE: 'all' intentionally excludes 'stocks' — bStocks are fetched and
   scored separately (loadBstocks() in data-loaders.js) and merged into
   the shared coins[] array with COIN_CATEGORIES[id]='stocks' set at
   fetch time, since they're not present in FREE_COINS (that list is
   CoinGecko coin IDs only). The STOCKS tab reads coins[] like any other
   category tab — see renderTable() in signals.js. */
function getCategoryCoins(cat) {
  if (cat === 'all')    return FREE_COINS;
  if (cat === 'stocks') return []; /* populated dynamically, not from FREE_COINS */
  return FREE_COINS.filter(function(id) { return (COIN_CATEGORIES[id] || 'other') === cat; });
}

function getActiveCoins() { return FREE_COINS; } /* All 200 crypto coins always available */

/* ── Stablecoin APR database ────────────────────────────────────── */
/* Approximate lending/staking APR (%) for stablecoins.              */
/* These are representative DeFi rates — updated periodically.       */
var STABLECOINS = {
  'tether':          { sym: 'USDT', apr: 4.5,  platform: 'Aave / Compound' },
  'usd-coin':        { sym: 'USDC', apr: 4.2,  platform: 'Aave / Compound' },
  'dai':             { sym: 'DAI',  apr: 5.0,  platform: 'Maker DSR' },
  'first-digital-usd':{ sym:'FDUSD',apr: 3.8,  platform: 'Binance Earn' },
  'true-usd':        { sym: 'TUSD', apr: 3.5,  platform: 'Aave / Venus' },
  'ethena-usde':     { sym: 'USDe', apr: 12.0, platform: 'Ethena sUSDe' },
  'frax':            { sym: 'FRAX', apr: 4.0,  platform: 'Frax Finance' },
  'paypal-usd':      { sym: 'PYUSD',apr: 3.2,  platform: 'Aave / Morpho' },
  'gemini-dollar':   { sym: 'GUSD', apr: 3.0,  platform: 'Gemini Earn' },
  'usdd':            { sym: 'USDD', apr: 5.5,  platform: 'JustLend (Tron)' }
};

function isStablecoin(coinId) { return STABLECOINS.hasOwnProperty(coinId); }

/* Forex pairs removed — site is crypto (+ bStocks) only going forward.
   See rotator-bstocks-migration-plan.md. loadForex()/calcForexScore()/
   #forex-panel/FOREX nav tab removed in the same pass as this file. */

/* ── bStocks (Binance tokenized equities) ──────────────────────────
   Replaces the old Yahoo/AlphaVantage STOCKS_LIST + FOREX_PAIRS.
   No indices — Binance bStocks are single-name tokenized certificates
   only, there is no bStock for "S&P 500" etc.
   • sym:      display ticker, also the id used inside coins[] as
               'bstock_' + sym and inside COIN_CATEGORIES.
   • binance:  the actual Binance trading symbol synced into
               unified_market_data (asset_type='stock', source_name='binance').
   Maintained manually — update when Binance announces new bStock listings,
   do NOT auto-discover from exchangeInfo (risks false-positive symbol matches).
────────────────────────────────────────────────────────────────────── */
var BSTOCK_LIST = [
  /* Confirmed live tickers — sourced from Binance's own launch/expansion
     announcements and dividend notices (name+ticker explicitly paired in
     the source, not guessed from the company name). Binance's bStocks
     roster has grown to 46+ listings as of late Aug 2026 and keeps
     growing in batches — this covers every one I could confirm with a
     direct source citation, not the full current roster. Verify against
     Binance's live bStocks markets page or exchangeInfo before shipping,
     and add any missing ones the same way (sym / name / binance symbol). */
  {sym:'AAPL',  name:'Apple',                binance:'AAPLBUSDT'},
  {sym:'MSFT',  name:'Microsoft',            binance:'MSFTBUSDT'},
  {sym:'NVDA',  name:'NVIDIA',               binance:'NVDABUSDT'},
  {sym:'TSLA',  name:'Tesla',                binance:'TSLABUSDT'},
  {sym:'AMZN',  name:'Amazon',               binance:'AMZNBUSDT'},
  {sym:'META',  name:'Meta Platforms',       binance:'METABUSDT'},
  {sym:'AMD',   name:'AMD',                  binance:'AMDBUSDT'},
  {sym:'INTC',  name:'Intel',                binance:'INTCBUSDT'},
  {sym:'PLTR',  name:'Palantir',             binance:'PLTRBUSDT'},
  {sym:'MSTR',  name:'Strategy',             binance:'MSTRBUSDT'}, /* formerly MicroStrategy */
  {sym:'CRCL',  name:'Circle Internet Group',binance:'CRCLBUSDT'},
  {sym:'MU',    name:'Micron Technology',    binance:'MUBUSDT'},
  {sym:'SNDK',  name:'Sandisk',              binance:'SNDKBUSDT'},
  {sym:'SPCX',  name:'SpaceX',               binance:'SPCXBUSDT'},
  {sym:'LITE',  name:'Lumentum',             binance:'LITEBUSDT'},
  {sym:'AMAT',  name:'Applied Materials',    binance:'AMATBUSDT'},
  {sym:'DELL',  name:'Dell',                 binance:'DELLBUSDT'},
  {sym:'BE',    name:'Bloom Energy',         binance:'BEBUSDT'},
  {sym:'FLNC',  name:'Fluence Energy',       binance:'FLNCBUSDT'},
  {sym:'GS',    name:'Goldman Sachs',        binance:'GSBUSDT'},
  {sym:'PYPL',  name:'PayPal',               binance:'PYPLBUSDT'},
  {sym:'IBM',   name:'IBM',                  binance:'IBMBUSDT'},
  {sym:'HOOD',  name:'Robinhood',            binance:'HOODBUSDT'},
  {sym:'DJT',   name:'Trump Media & Technology Group', binance:'DJTBUSDT'}
  /* Named in Binance's own July batch coverage but ticker not confirmed
     by a direct source citation — left out rather than guessed:
     Coinbase, Alphabet, Nokia. Add once you've confirmed COINB/GOOGLB/
     NOKB (or whatever the real symbols turn out to be) actually exist. */
];
/* Deliberately excluded — Binance also lists sector/index ETFs and a
   LEVERAGED INVERSE ETF as bStocks (QQQB/Invesco QQQ, SMHB/VanEck
   Semiconductor, EWYB/iShares MSCI South Korea, and SOXSB/Direxion
   Semiconductor Bear 3X — a 3x short fund, a materially different risk
   profile from a single stock). The original migration plan said no
   indices/funds, single-name equities only — this list honors that.
   If you want funds included, they need their OWN badge/tooltip (not
   "STOCK") and should NOT run through the same momentum-only partial
   scorer as single names, since a 3x leveraged product's "momentum"
   isn't comparable to an unlevered one. Treat as a separate follow-up. */

/* ── Tokenomics database ─────────────────────────────────────────── */
/* deflation: 'full'=active burn | 'partial'=some burn | 'fixed'=hard cap | 'none'=inflation */
/* unlockRisk: 'low' | 'medium' | 'high' (vesting overhang)                                  */
/* unlock30d: OPTIONAL. % of circulating supply unlocking in the next 30 days.
   If > 5, the engine applies an extra -15 to Layer 3. NOT populated
   automatically — no live vesting-schedule feed exists in this project.

   ⚠ CURRENTLY EMPTY ON PURPOSE. This field previously carried three
   invented example values (sui 6.8, aptos 5.9, render-token 3.2) added
   to demonstrate the shape. Because 6.8 and 5.9 both clear the >5
   threshold, SUI and APT were each being docked 15 real points on
   numbers nobody had looked up — and unlike the macro inputs in L2,
   this field varies per coin, so it genuinely moved their ranking.
   They were removed 2026-09-06.

   A missing value is NOT the same as a low one: absent means "we don't
   know", which correctly applies no penalty. Do not repopulate this
   with estimates. Fill a coin in only from a real vesting schedule
   (token.unlocks.app, Vestlab, or DefiLlama's unlocks data), and only
   for coins with genuine near-term cliffs — mainly those already marked
   unlockRisk:'high'. Fixed-supply coins (BTC/LTC) can skip it entirely.

   NOTE: this table is mirrored into
   supabase/functions/compute-signal-run/_vendor/rotator-engine/site-tables.mjs,
   which is what the SERVER-AUTHORITATIVE score actually reads. Editing
   here alone changes only the client-side fallback — the vendored copy
   must be updated and the function redeployed for a change to reach
   live scores.  */
var TOKENOMICS_DB = {
  'bitcoin':              {deflation:'fixed',   unlockRisk:'low'},
  'ethereum':             {deflation:'partial', unlockRisk:'low'},
  'binancecoin':          {deflation:'full',    unlockRisk:'low'},
  'solana':               {deflation:'none',    unlockRisk:'medium'},
  'ripple':               {deflation:'none',    unlockRisk:'high'},
  'dogecoin':             {deflation:'none',    unlockRisk:'low'},
  'cardano':              {deflation:'none',    unlockRisk:'low'},
  'avalanche-2':          {deflation:'partial', unlockRisk:'medium'},
  'shiba-inu':            {deflation:'partial', unlockRisk:'low'},
  'chainlink':            {deflation:'none',    unlockRisk:'high'},
  'polkadot':             {deflation:'none',    unlockRisk:'medium'},
  'bitcoin-cash':         {deflation:'fixed',   unlockRisk:'low'},
  'near':                 {deflation:'none',    unlockRisk:'medium'},
  'litecoin':             {deflation:'fixed',   unlockRisk:'low'},
  'uniswap':              {deflation:'partial', unlockRisk:'medium'},
  'internet-computer':    {deflation:'none',    unlockRisk:'high'},
  'ethereum-classic':     {deflation:'fixed',   unlockRisk:'low'},
  'stellar':              {deflation:'partial', unlockRisk:'medium'},
  'monero':               {deflation:'none',    unlockRisk:'low'},
  'okb':                  {deflation:'full',    unlockRisk:'low'},
  'hedera-hashgraph':     {deflation:'none',    unlockRisk:'high'},
  'filecoin':             {deflation:'none',    unlockRisk:'high'},
  'cosmos':               {deflation:'none',    unlockRisk:'medium'},
  'vechain':              {deflation:'partial', unlockRisk:'low'},
  'tron':                 {deflation:'partial', unlockRisk:'low'},
  'sui':                  {deflation:'none',    unlockRisk:'high'},
  'aptos':                {deflation:'none',    unlockRisk:'high'},
  'sei-network':          {deflation:'none',    unlockRisk:'high'},
  'render-token':         {deflation:'partial', unlockRisk:'medium'},
  'jupiter-exchange-solana':{deflation:'partial',unlockRisk:'medium'},
  'aave':                 {deflation:'partial', unlockRisk:'low'},
  'the-graph':            {deflation:'none',    unlockRisk:'high'},
  'curve-dao-token':      {deflation:'partial', unlockRisk:'medium'},
  'maker':                {deflation:'full',    unlockRisk:'low'},
  'lido-dao':             {deflation:'none',    unlockRisk:'medium'},
  'arbitrum':             {deflation:'none',    unlockRisk:'high'},
  'optimism':             {deflation:'none',    unlockRisk:'high'},
  'stacks':               {deflation:'fixed',   unlockRisk:'medium'},
  'immutable-x':          {deflation:'none',    unlockRisk:'high'},
  'injective-protocol':   {deflation:'full',    unlockRisk:'low'},
  'blur':                 {deflation:'none',    unlockRisk:'high'},
  'bonk':                 {deflation:'partial', unlockRisk:'low'},
  'dogwifcoin':           {deflation:'none',    unlockRisk:'low'},
  'book-of-meme':         {deflation:'none',    unlockRisk:'low'},
  'pepe':                 {deflation:'none',    unlockRisk:'low'},
  'ondo-finance':         {deflation:'none',    unlockRisk:'high'},
  'worldcoin-wld':        {deflation:'none',    unlockRisk:'high'},
  'pyth-network':         {deflation:'none',    unlockRisk:'high'},
  'jito-governance-token':{deflation:'none',    unlockRisk:'high'},
  'ethena':               {deflation:'partial', unlockRisk:'high'}
};

/* ══════════════════════════════════════════════════════════════════
   PRO DONATION CODES — now server-side
   ────────────────────────────────────
   Codes live in the Supabase `pro_codes` table and are validated by
   the redeem_pro_code() RPC. They are NEVER shipped to the browser,
   so View Source cannot leak them. Single-use is enforced server-side
   (a code consumed on device A cannot be redeemed on device B).

   First-time setup: run sql/pro_codes_table.sql in the Supabase SQL
   editor. That script also seeds the legacy ROT-2026-* codes so any
   already-handed-out code keeps working.

   Add a new code:
     INSERT INTO pro_codes (code, note)
       VALUES ('ROT-2026-NEWCODE', 'who it went to');

   Revoke a code:
     UPDATE pro_codes SET active = false WHERE code = 'ROT-2026-XXX';

   Format convention: ROT-YEAR-XXXXX
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   DONATION GOAL TRACKER
   ─────────────────────
   Update DONATION_CURRENT manually each time a donation comes in.
   DONATION_GOAL = monthly target in USD.
══════════════════════════════════════════════════════════════════ */
var DONATION_GOAL    = 50;   /* $ monthly target  — update as needed */
var DONATION_CURRENT = 0;    /* $ received so far — UPDATE MANUALLY  */
var DONATION_LABEL   = 'monthly server costs';

/* ══════════════════════════════════════════════════════════════════
   PRO TIER PLANS
   ──────────────
   One-time contribution tiers. All unlock lifetime Pro.
   Different amounts = different supporter levels, same features.
   Codes bypass payment.
══════════════════════════════════════════════════════════════════ */
var PRO_PLANS = [
  { label: 'Small Tip',           price: 5,  months: 0, badge: 'Supporter' },
  { label: 'Standard Support',    price: 15, months: 0, badge: 'Supporter' },
  { label: 'Legendary Supporter', price: 50, months: 0, badge: 'Legend' }
];
