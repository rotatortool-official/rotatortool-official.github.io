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
  /* Mega caps */
  'bitcoin','ethereum','binancecoin','solana','ripple',
  /* Large caps */
  'dogecoin','cardano','avalanche-2','shiba-inu','chainlink',
  'polkadot','bitcoin-cash','near','litecoin','uniswap',
  'internet-computer','ethereum-classic','stellar','monero','okb',
  /* Mid caps */
  'hedera-hashgraph','filecoin','cosmos','vechain','tron',
  'sui','aptos','sei-network','render-token','jupiter-exchange-solana',
  /* DeFi */
  'aave','the-graph','curve-dao-token','maker','lido-dao',
  /* L2 & Infrastructure */
  'arbitrum','optimism','stacks','immutable-x','injective-protocol',
  /* Meme & Emerging */
  'blur','bonk','dogwifcoin','book-of-meme','pepe',
  /* RWA & New */
  'ondo-finance','worldcoin-wld','pyth-network','jito-governance-token','ethena',
  /* Additional 50 — always free */
  'hyperliquid','toncoin','the-sandbox','decentraland','axie-infinity',
  'gala','illuvium','stepn','flow','wax',
  'ocean-protocol','fetch-ai','singularitynet','numeraire','bittensor',
  'zetachain','celestia','dymension','altlayer','omni-network',
  'saga-2','manta-network','mew','nyan-heroes','parcl',
  'io-net','kamino','meteora','drift-protocol','marginfi',
  'raydium','orca','lifinity','saber','serum',
  'wormhole','layerzero','across-protocol','synapse-2','stargate-finance',
  'gmx','gains-network','kwenta','polynomial-protocol','vertex-protocol',
  'pendle','spectra-finance','time-wonderland','convex-finance','frax-share'
];

var PRO_EXTRA_COINS = []; /* All 100 in free tier — Pro reserved for future expansion */

function getActiveCoins() { return FREE_COINS; } /* All 100 always available */

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
