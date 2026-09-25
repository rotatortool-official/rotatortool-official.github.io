/* ══════════════════════════════════════════════════════════════════
   config.js  —  All lists, settings & codes you'll want to edit
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE COINS:        Edit FREE_COINS list
   • ADD/REMOVE bSTOCKS:      Nothing to edit — the roster is discovered
                              server-side by sync-bstocks. To exclude a
                              listing, edit FUND_DENYLIST there.
                              BSTOCK_LIST below is frozen history, not the
                              roster; see the note above it.
   • ADD PRO CODES:           Run an INSERT in Supabase (pro_codes table) —
                              codes live server-side, see sql/pro_codes_table.sql
   • UPDATE DONATION GOAL:    Change DONATION_GOAL and DONATION_CURRENT
   • UPDATE TOKENOMICS:       Edit TOKENOMICS_DB
══════════════════════════════════════════════════════════════════ */

/* ── Measured evidence behind the signal cards ────────────────────
   Every claim a card makes about how a signal has BEHAVED comes from
   here. Nothing in the copy states a figure of its own.

   This exists because the cards used to assert direction ("LAGGING",
   "ROTATION SETUP") with nothing behind the words, while the scoring
   engine was measuring something different and better. See
   promptove/47. The rule now: if a card claims it, this block measured
   it, and the block says when.

   MEASURED 2026-09-17 against binance_daily_klines (175 symbols,
   2026-04-20 onward), signal_snapshots and rotation_snapshots.

   THESE GO STALE. They are a record of a measurement, not constants of
   nature — re-run the scripts below and update the numbers and the
   date together, or delete the claim. A figure here that no longer
   matches the data is worse than no figure at all.

     rotation record   19 of 30 pairs cleared the 2% spread
     rotation chance   random pairs from the same universe, 200k draws
                       per window across 144 completed 7-day windows
     laggard regime    bottom trailing-30d quintile, excess return vs
                       the window's market median, split on whether that
                       median was positive
     give-back         coins scoring 70+, forward 7d return
     score momentum    corr(score, trailing 30d return) over 134
                       snapshots carrying both windows                    */
var ROTATOR_EVIDENCE = {
  measuredOn:      '2026-09-17',
  universe:        { symbols: 175, since: '2026-04-20', windows: 144 },

  /* ── Rotation ────────────────────────────────────────────────────
     confirmed/bothFellWins were 63% and 8-of-19, measured over mixed
     1-to-7 day horizons against a 2% spread. On 2026-09-17 rotation
     grading moved to a fixed 30-day window with a 0% spread, so those
     figures describe a test that no longer runs and are GONE rather
     than restated — the rule in this file's header is that a number
     which no longer matches the data is worse than no number.

     No rotation call is 30 days old yet. The first ones grade
     2026-10-07, and `confirmed` stays null until then; the cards read
     `firstGradesOn` and say so instead of implying a record.

     `chance` is measured and does not depend on our calls: two coins
     picked at random from the universe clear a positive 30-day spread
     50.3% of the time. That is the bar the record will be read
     against. */
  rotation:        { confirmed: null, chance: 50, n: 0,
                     bothFellWins: null, totalWins: null,
                     horizonDays: 30, firstGradesOn: '2026-10-07' },

  /* The single-coin confirm metric, measured the way the track record
     actually grades it: ordered window over [snap+1d, snap+14d], window
     extreme, adverse bar at 3x. A blanket call on every coin confirms
     ~68% of the time, because a 1.5-5% bar checked against the best
     moment in two weeks is cleared by ordinary volatility.

     It is here so nothing can quote a single-coin accuracy figure
     without the bar it has to beat. Published 2026-09-17 as 31% - that
     was a close-to-close measurement of a grader that does not work
     close-to-close, and it flattered the tool by more than double.
     See promptove/49. */
  singleCoin:      { chance: 68, method: 'ordered window, peak capture, 14d' },

  laggard:         { upExcess: 2.2,  upHitRate: 63,
                     downExcess: -1.4, downHitRate: 36, windows: 114 },

  giveBack:        { n: 9, wereUp: 0, medianReturn: -8.5, meanTrailing30d: 59 },

  scoreMomentumR:  0.72,

  /* ── RSI reclaim ─────────────────────────────────────────────────
     Measured 2026-09-18 (promptove/53): daily RSI(14) back at or above
     30 after closes below it, 7-day forward return against the market,
     three years of the universe. How long RSI stayed below 30 is the
     whole signal, and it cuts both ways:

       days below    n     beat the market
         1-2       1083        53.2%   significant
         11+         58        31.0%   significant, negative

     The coin modal quotes `quick` for a fast reclaim. Moved here on
     2026-09-25 from a figure typed into data-loaders.js, which
     verify-grading-invariants rightly refused. */
  rsiReclaim:      { measuredOn: '2026-09-18', horizonDays: 7,
                     quick: { maxDaysBelow: 2,  beatPct: 53.2, n: 1083 },
                     slow:  { minDaysBelow: 11, beatPct: 31.0, n: 58 } },

  /* ── Entry timing ────────────────────────────────────────────────
     Measured 2026-09-17: buy the bottom trailing-30d quintile, hold to
     day 30 from the call, and vary only how many days the entry is
     spread across. 3,031 observations per row.

       days   mean ret   median   stdev   worst 5%
         1      4.57%    -1.49%    59.3    -29.4%
         3      4.65%    -1.11%    57.7    -28.6%
         5      4.54%    -0.91%    55.5    -27.5%
         7      4.33%    -1.01%    52.7    -26.0%

     Averaging the entry costs nothing in expected return out to five
     days, and takes about 6% off the volatility and 2 points off the
     worst 5%. Past day five the mean starts to erode.

     6% is 1 - stdev/stdevSingle (55.5/59.3), which is what the card
     renders and what promptove/49 recorded. It said 9% until
     2026-09-22 and that matched neither. VOLATILITY, not variance:
     the figure is a reduction in standard deviation. The variance
     reduction is 12.4%, and calling a stdev number "variance" quietly
     understated the effect while misnaming it.

     Note the shape while reading it: the MEDIAN is negative and the
     mean is strongly positive, so this is a right-skewed bet — most of
     these lose a little and a few win a lot. Spreading the entry moves
     the median toward zero, which is the outcome most calls actually
     get. This is a property of the historical record, not a
     recommendation. */
  entry:           { days: 5, meanSingle: 4.57, mean: 4.54,
                     stdevSingle: 59.3, stdev: 55.5,
                     worst5Single: -29.4, worst5: -27.5, n: 3031 }
};

/* ── Crypto coin lists ───────────────────────────────────────────── */
var FREE_COINS = [
  /* ── Mega caps ── */
  'bitcoin','ethereum','binancecoin','solana','ripple',
  /* ── Large caps ── */
  'dogecoin','cardano','avalanche-2','shiba-inu','chainlink',
  'polkadot','bitcoin-cash','near','litecoin','uniswap',
  'internet-computer','ethereum-classic','stellar','monero',
  /* ── Mid caps ── */
  'hedera-hashgraph','filecoin','cosmos','vechain','tron',
  'sui','aptos','sei-network','render-token','jupiter-exchange-solana',
  /* ── DeFi ── */
  'aave','the-graph','curve-dao-token','maker','lido-dao',
  /* ── L2 & Infrastructure ── */
  'arbitrum','optimism','immutable-x','injective-protocol',
  /* ── Meme & Emerging ── */
  'blur','bonk','dogwifcoin','book-of-meme','pepe',
  /* ── RWA & New ── */
  'ondo-finance','worldcoin-wld','pyth-network','jito-governance-token','ethena',
  /* ── Batch 51–100 ── */
  'hyperliquid','the-sandbox','decentraland','axie-infinity',
  'gala','illuvium','stepn','flow','wax',
  'ocean-protocol','fetch-ai','singularitynet','numeraire','bittensor',
  'celestia','dymension','altlayer','omni-network',
  'saga-2','manta-network',
  'kamino','meteora',
  'raydium','orca','lifinity','saber','serum',
  'wormhole','layerzero','across-protocol','synapse-2','stargate-finance',
  'gmx','gains-network',
  'pendle','spectra-finance','convex-finance','frax-share',
  /* ── Batch 101–150: more L1s, gaming, AI, privacy ── */
  'kava','zilliqa',
  'harmony','celo','moonbeam','astar','fantom',
  'theta-token','enjincoin','gods-unchained','ultra',
  'beam-2','myria','xai-blockchain',
  'arkham','dextools','mask-network','1inch','sushi',
  'pancakeswap-token','thorchain','osmosis','neutron-3',
  'arweave','livepeer','theta-fuel','helium',
  'quant-network','algorand','elrond-erd-2','iota','eos',
  'neo','qtum','waves','conflux-token','icon',
  /* ── Batch 151–200: DeFi, stables, bridges, memes, infra ── */
  'compound-governance-token','yearn-finance','ribbon-finance','morpho','euler',
  'balancer','rocket-pool','ankr','ssv-network',
  'oasis-network','secret','nucypher','keep-network','hopr',
  'floki','brett','turbo-eth',
  'wen-4',
  'magic-eden','tensor','sanctum-2',
  'polymarket',
  'reserve-rights-token','centrifuge',
  /* ── Stablecoins — shown with APR instead of % change ── */
  /* 'frax' (the stablecoin) was REMOVED 2026-09-09. It collided with
     'frax-share', which CoinGecko also reports as symbol FRAX, so the
     universe carried two coins rendering the same ticker. Binance
     settles which one owns it: Binance lists exactly one FRAX — with
     daily klines and a FRAXUSDT futures pair — and that is the tradable
     token CoinGecko calls 'frax-share'. The stablecoin is not on
     Binance at all.

     The collision was not cosmetic. holdings and watchlist are keyed by
     SYMBOL, so a FRAX holding matched whichever of the two loaded
     first. It also produced a false line in engine 2.4.0's movement
     diff until that was re-keyed onto coin id.

     Dropped rather than relabelled because nine other stablecoins still
     carry the APR panel, and inventing a ticker for this one would be
     asserting a rebrand this project has no source for. It stays in
     STABLECOINS below as a CLASSIFIER — see the note there. */
  'tether','usd-coin','dai','first-digital-usd','true-usd',
  'ethena-usde','paypal-usd','gemini-dollar','usdd',

  /* ── Batch 201-256: Binance pairs added 2026-09-11 ──
     Picked by intersecting CoinGecko's top 750 by market cap with the
     Binance USDT pairs trading above $300k/day, minus what was already
     here. Ids come FROM CoinGecko, never guessed from a ticker.

     Three were rejected for TICKER COLLISION, which is the trap this
     list has hit before (two coins reported as FRAX, fixed 2026-09-09):
     cross-2 and centrifuge-2 trade as ONE and CFG, both already here,
     and memecoin-2 collided with another pick. Two coins rendering one
     ticker means a holding matches whichever loaded first.

     Monitoring-tagged symbols were excluded at selection time as well
     as by the 2.8.0 eligibility gate — no point adding a coin the
     engine will refuse to publish. */
  'zcash','the-open-network','tether-gold','aster-2','pax-gold',
  'world-liberty-financial','pump-fun','sky','polygon-ecosystem-token','just',
  'nexo','dash','ether-fi','aerodrome-finance','official-trump',
  'falcon-finance-ff','pudgy-penguins','virtual-protocol','sun-token','tezos',
  'terra-luna','decred','syrup','plasma','ethereum-name-service',
  'trust-wallet-token','starknet','eigenlayer','kaia','doublezero',
  'ecash','chiliz','apecoin','zencash','havven',
  'mina-protocol','golem','sonic-3','zksync','prometeus',
  'four','dydx-chain','ordinals','plume','superfarm',
  'kaito','kusama','holotoken','goplus-security','dexe',
  'turbo','redstone-oracles','spark-2','linea','berachain-bera',
  'coti',

  /* ── 18 Binance pairs, 2026-09-25, in the slots of 18 dead ids ──
     promptove/36 found 18 ids CoinGecko never answers (stacks, toncoin,
     mew, nyan-heroes, io-net, marginfi, kwenta, polynomial-protocol,
     vertex-protocol, time-wonderland, treasure-lol, kujira, memecoin,
     neiro-on-eth, jup, shadow-token, mantra-dao, maple-finance). They
     cost nothing but used 18 of the 250 ids one request can carry.

     Same mechanical selection as the 2026-09-11 batch: CoinGecko's top
     1000 by market cap, intersected with Binance USDT pairs TRADING
     above $300k/day, minus tickers already rendered here, stablecoins,
     wrapped assets and Monitoring-tagged symbols; then the largest 18.
     Three checks were added this time:
       - CoinGecko price within 3% of Binance's last price, so the id
         really is the coin Binance lists under that ticker;
       - at least 31 Binance daily candles, or the coin would only be
         excluded as incomplete_history (MARSCOIN had 22);
       - plain A-Z/0-9 tickers, and no tokenised stocks (those belong
         to the bStocks universe). 币安人生 and 牛来 were skipped here. */
  'midnight-3','kite-2','zama','vaulta','sentient',
  'genius-3','walrus-2','gas','rif-token','cow-protocol',
  'banana-for-scale-2','vethor-token','re','allora','nervos-network',
  'bio-protocol','espresso','pha',

  /* ── 20 more Binance pairs, 2026-09-25, replacing 20 coins Binance
     does not list ──
     Run 1934 had 20 eligible coins with no USDT pair on Binance under
     any status or quote (okb, mantle, kaspa, flare-networks, grass,
     akash-network, frax-ether, zetachain, popcat, toshi, ronin,
     cat-in-a-dogs-world, nosana, clearpool, echelon-prime, ponke,
     drift-protocol, marinade, hivemapper, parcl). sync-binance-status
     now flags such coins NOT_LISTED, so they could never be published;
     keeping them only spent slots. Re-checked against exchangeInfo
     before removal: none had any Binance listing.

     Replacements: the next 20 from the same selection as the batch
     above, with the same checks. */
  'nillion','axelar','io','threshold-network-token','babylon',
  'space-id','polymesh','ontology','tellor','peanut-the-squirrel',
  'dusk-network','zero-gravity','lombard-protocol','holoworld','megaeth',
  'verge','notcoin','constitutiondao','huma-finance','succinct'
];

var PRO_EXTRA_COINS = []; /* All 200 in free tier — Pro reserved for future expansion */

/* ── Coin category map ───────────────────────────────────────────
   Each coin ID → category tag.  Used by the leaderboard filter tabs.
   Coins not listed here default to 'other'.
   Categories: l1, defi, l2, meme, ai, gaming, rwa, infra, stable
──────────────────────────────────────────────────────────────────── */
/* ══ Binance's own category vocabulary ═══════════════════════════════
   COIN_CATEGORIES below is 194 hand-maintained assignments. Binance
   publishes the same information on the feed sync-binance-status already
   reads, so it is now the source and the hand map is the fallback.

   Why a map rather than using Binance's strings directly: the tab bar is
   a product decision (ten tabs that fit on a phone), Binance's vocabulary
   is 27 tags and theirs to change. This is the seam between them.

   Layer1_Layer2 is the one tag that does NOT map cleanly — Binance lumps
   L1 and L2 together and the site splits them. For those coins the hand
   map still decides which of the two, and that is the only thing it is
   still authoritative for.                                             */
var BINANCE_TAG_TO_CAT = {
  'bStocks':        'stocks',
  'stablecoin':     'stable',
  'Meme':           'meme',
  'AI':             'ai',
  'Gaming':         'gaming',
  'RWA':            'rwa',
  'defi':           'defi',
  'Infrastructure': 'infra'
};

/* Order matters, and it is not "most specific wins".

   A chain is a chain. Tried thematic-first and it moved AVAX, ICP and VET
   into RWA and INJ into AI, because Binance tags chains with the sectors
   they court. Nobody looking for AVAX opens the RWA tab. So the layer tag,
   where present, beats every thematic tag — and only stocks/stable, which
   are structural rather than thematic, outrank it.

   Measured over the 201 tracked coins: chain-first reclassifies 25 and
   keeps L1 at 46 (hand map said 40); thematic-first reclassified 30 and
   collapsed L1 to 36 by scattering chains across sector tabs.

   Below the layer tag, the order is a fixed list rather than Binance's
   array order, which is not a contract. */
var BINANCE_CAT_PRIORITY = ['meme','ai','gaming','rwa','defi','infra'];

/* Populated by loadBinanceTags() in data-loaders.js: { SYM: [tags] }.
   Empty until that resolves, and empty forever if the read fails — in
   which case every lookup below falls through to the hand map, i.e. the
   behaviour this replaced. */
var binanceTags = {};

/* The one place that answers "which tab does this coin belong to". */
function categoryOf(c) {
  if (!c) return 'other';
  var hand = COIN_CATEGORIES[c.id] || 'other';

  /* bStocks are registered into COIN_CATEGORIES at fetch time and are not
     in the crypto tag feed under their own symbols — trust the hand value. */
  if (hand === 'stocks') return 'stocks';

  var tags = binanceTags[c.sym];
  if (!tags || !tags.length) return hand;

  /* Structural tags first — these describe what the instrument IS. */
  if (tags.indexOf('bStocks') >= 0)    return 'stocks';
  if (tags.indexOf('stablecoin') >= 0) return 'stable';

  /* Then chain identity. Binance cannot tell us L1 from L2 — it has one
     Layer1_Layer2 tag where the site has two tabs — so the hand map
     breaks that tie, and that is the only thing it still decides. */
  if (tags.indexOf('Layer1_Layer2') >= 0) {
    return (hand === 'l1' || hand === 'l2') ? hand : 'l1';
  }

  /* Everything else falls to its sector. */
  for (var i = 0; i < BINANCE_CAT_PRIORITY.length; i++) {
    var want = BINANCE_CAT_PRIORITY[i];
    for (var j = 0; j < tags.length; j++) {
      if (BINANCE_TAG_TO_CAT[tags[j]] === want) return want;
    }
  }
  return hand;
}

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

function getActiveCoins() { return FREE_COINS; } /* All 195 crypto coins always available */

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
  /* Kept although 'frax' is no longer fetched (see FREE_COINS above).
     This map is the isStable CLASSIFIER, not a display list — nothing
     iterates it, data-loaders.js only looks coins up in it by id. So
     the entry costs nothing and still flags the coin correctly if it
     ever reappears in the feed, and removing it would rescore the
     frozen golden fixture, which still contains that day's row. */
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
];
/* ⚠ THIS IS NO LONGER THE bSTOCK ROSTER (changed 2026-09-16).
   It is a FROZEN HISTORICAL SET and must not be extended.

   The live roster is discovered server-side by the sync-bstocks Edge
   Function from `binance_symbol_tags` — the table sync-binance-status
   already fills with Binance's own tag vocabulary. Adding a ticker
   here does nothing; the page builds its STOCKS tab from whatever
   unified_market_data holds. To exclude a listing, add it to
   FUND_DENYLIST in sync-bstocks/index.ts.

   Keeping this list as a hand-maintained roster is what caused the
   problem it is now a record of: it sat at 24 entries while Binance
   grew to 77, and its own comment listed Coinbase, Alphabet and Nokia
   as "ticker not confirmed" when COINB, GOOGLB and NOKB had existed
   the whole time.

   WHAT STILL READS IT — one thing only: the one-time migration of
   legacy `rot_st_h` stock holdings in holdings.js, which needs the set
   of tickers that existed WHEN THAT MIGRATION WAS WRITTEN, not today's.
   Extending it would silently widen that migration's scope. Ongoing
   holdings are validated against live coins[] by pruneStaleHoldings().
   data-loaders.js also falls back to `name` here if a row arrives
   without one, which no longer happens now that names come from
   Binance server-side.

   ── On funds, which the roster still excludes ──
   Binance tags sector/index and LEVERAGED funds as bStocks too (SPY,
   QQQ, TQQQ, SQQQ, SOXL, SOXS, SMH, EWY, KORU, DRAM, and four 2x
   single-stock wrappers). The migration plan said single-name equities
   only, and FUND_DENYLIST honors that. If you want funds included they
   need their OWN badge/tooltip (not "STOCK") and must NOT run through
   the same momentum-only partial scorer as single names, since a 3x
   leveraged product's "momentum" isn't comparable to an unlevered
   one. Still a separate follow-up. */

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
