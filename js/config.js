/* ══════════════════════════════════════════════════════════════════
   config.js  —  All lists, settings & codes you'll want to edit
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE COINS:        Edit FREE_COINS list
   • ADD/REMOVE FOREX PAIRS:  Edit FOREX_PAIRS list (set pro:true to lock behind Pro)
   • ADD/REMOVE STOCKS:       Edit STOCKS_LIST
   • ADD PRO CODES:           Add a string to VALID_CODES
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

/* Category display config — order matters for tab rendering */
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
  {key:'stable', label:'STABLE',  icon:'💵'}
];

/* Get coin IDs for a specific category (or all if 'all') */
function getCategoryCoins(cat) {
  if (cat === 'all') return FREE_COINS;
  return FREE_COINS.filter(function(id) { return (COIN_CATEGORIES[id] || 'other') === cat; });
}

function getActiveCoins() { return FREE_COINS; } /* All 200 always available */

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

/* ── Forex pairs ─────────────────────────────────────────────────── */
/* Set pro:true to lock a pair behind Pro tier                        */
var FOREX_PAIRS = [
  {from:'EUR', to:'USD', name:'Euro / US Dollar',               pro:false},
  {from:'GBP', to:'USD', name:'British Pound / US Dollar',      pro:false},
  {from:'USD', to:'JPY', name:'US Dollar / Japanese Yen',       pro:false},
  {from:'USD', to:'CHF', name:'US Dollar / Swiss Franc',        pro:false},
  {from:'AUD', to:'USD', name:'Australian Dollar / US Dollar',  pro:false},
  {from:'USD', to:'CAD', name:'US Dollar / Canadian Dollar',    pro:false},
  {from:'NZD', to:'USD', name:'New Zealand Dollar / US Dollar', pro:false},
  {from:'EUR', to:'GBP', name:'Euro / British Pound',           pro:false},
  {from:'EUR', to:'JPY', name:'Euro / Japanese Yen',            pro:false},
  {from:'GBP', to:'JPY', name:'British Pound / Japanese Yen',   pro:false},
  {from:'XAU', to:'USD', name:'Gold / US Dollar',               pro:true},
  {from:'XTI', to:'USD', name:'WTI Crude Oil / USD',            pro:true},
  {from:'EUR', to:'CHF', name:'Euro / Swiss Franc',             pro:true},
  {from:'USD', to:'MXN', name:'US Dollar / Mexican Peso',       pro:true},
  {from:'USD', to:'SGD', name:'US Dollar / Singapore Dollar',   pro:true}
];

/* ── Stocks & Indices list ───────────────────────────────────────── */
/* av: Alpha Vantage symbol (null = not available on AV free tier)   */
var STOCKS_LIST = [
  /* Indices */
  {sym:'^GSPC',  name:'S&P 500',         type:'index', av:'SPY'},
  {sym:'^IXIC',  name:'NASDAQ',           type:'index', av:'QQQ'},
  {sym:'^DJI',   name:'Dow Jones',        type:'index', av:'DIA'},
  {sym:'^RUT',   name:'Russell 2000',     type:'index', av:'IWM'},
  {sym:'^FTSE',  name:'FTSE 100',         type:'index', av:null},
  {sym:'^GDAXI', name:'DAX',              type:'index', av:null},
  {sym:'^N225',  name:'Nikkei 225',       type:'index', av:null},
  /* US Large Caps */
  {sym:'AAPL',   name:'Apple',            type:'stock', av:'AAPL'},
  {sym:'MSFT',   name:'Microsoft',        type:'stock', av:'MSFT'},
  {sym:'NVDA',   name:'NVIDIA',           type:'stock', av:'NVDA'},
  {sym:'TSLA',   name:'Tesla',            type:'stock', av:'TSLA'},
  {sym:'AMZN',   name:'Amazon',           type:'stock', av:'AMZN'},
  {sym:'GOOGL',  name:'Alphabet',         type:'stock', av:'GOOGL'},
  {sym:'META',   name:'Meta Platforms',   type:'stock', av:'META'},
  {sym:'JPM',    name:'JPMorgan Chase',   type:'stock', av:'JPM'},
  {sym:'V',      name:'Visa',             type:'stock', av:'V'},
  {sym:'BRK-B',  name:'Berkshire B',      type:'stock', av:'BRK-B'},
  /* High-growth / AI */
  {sym:'AMD',    name:'AMD',              type:'stock', av:'AMD'},
  {sym:'INTC',   name:'Intel',            type:'stock', av:'INTC'},
  {sym:'PLTR',   name:'Palantir',         type:'stock', av:'PLTR'},
  {sym:'COIN',   name:'Coinbase',         type:'stock', av:'COIN'},
  {sym:'MSTR',   name:'MicroStrategy',    type:'stock', av:'MSTR'}
];

/* ── Tokenomics database ─────────────────────────────────────────── */
/* deflation: 'full'=active burn | 'partial'=some burn | 'fixed'=hard cap | 'none'=inflation */
/* unlockRisk: 'low' | 'medium' | 'high' (vesting overhang)                                  */
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
   PRO DONATION CODES
   ──────────────────
   Each code can only be used ONCE per device.
   To add a new code: add a string to the array below.
   To revoke: remove it (devices that already used it keep Pro
              until they clear their browser storage).
   Format convention: ROT-YEAR-XXXXX
══════════════════════════════════════════════════════════════════ */
var VALID_CODES = [
  'ROT-2026-ALPHA',
  'ROT-2026-BETA1',
  'ROT-2026-BETA2',
  'ROT-2026-PRO01',
  'ROT-2026-PRO02',
  'ROT-2026-PRO03',
  'ROT-2026-PRO04',
  'ROT-2026-PRO05',
  'ROT-2026-DONOR',
  'ROT-2026-EARLY',
  /* ↑ Add more codes here as donations come in */
];

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
   Donation-based Pro tiers. Each tier grants Pro for a duration.
   Skrill links use these amounts. Codes bypass payment.
══════════════════════════════════════════════════════════════════ */
var PRO_PLANS = [
  { label: '1 Month',   price: 5,  months: 1,  badge: 'Starter' },
  { label: '3 Months',  price: 10, months: 3,  badge: 'Supporter' },
  { label: '6 Months',  price: 20, months: 6,  badge: 'Pro' }
];
