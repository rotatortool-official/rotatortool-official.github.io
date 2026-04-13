/* ══════════════════════════════════════════════════════════════════
   ratio.js  —  Swap Ratio Tracker
   FEATURES:
   • FROM dropdown: user holdings first, then all 100 coins
   • TO dropdown:   all 100 coins (excluding selected FROM)
   • Selected pair saved to localStorage — restored on next visit
   • Saved pairs bar — star to save, click to load, × to remove
   • Chart, range bar, badge, swap calculator
   • Uses apiFetch() from api-pool.js (caching + proxy rotation)
   ──────────────────────────────────────────────────────────────
   FIXES (2026):
   • BUG 1: Right panel acting as giant button — the document-level
     capture listener from _openPicker was leaking. Replaced with a
     clean single-listener pattern that is always removed before
     re-attaching, and guards against display:none state properly.
   • BUG 2: Swap arrows not swapping card values — updateLabels() and
     updateIcons() now run synchronously before loadAll(), so the
     FROM/TO cards visually flip instantly on click.
   • BUG 3: Chart not rendering — Chart.js CDN load race + collapsed
     section zero-height canvas. Added a retry loop that waits for
     both window.Chart and a non-zero canvas height before drawing.
══════════════════════════════════════════════════════════════════ */

var RatioTracker = (function() {

  var LS_PAIR  = 'rot_ratio_pair';
  var LS_SAVED = 'rot_ratio_saved';

  var S = {
    from:null, to:null,
    fromPrice:null, toPrice:null,
    fromChg:null, toChg:null,
    days:7, series:[], chart:null,
    loading:false, histCache:{}, saved:[]
  };

  var LABELS = {
    'bitcoin':'BTC','ethereum':'ETH','binancecoin':'BNB','solana':'SOL',
    'ripple':'XRP','dogecoin':'DOGE','cardano':'ADA','avalanche-2':'AVAX',
    'shiba-inu':'SHIB','chainlink':'LINK','polkadot':'DOT','bitcoin-cash':'BCH',
    'near':'NEAR','litecoin':'LTC','uniswap':'UNI','internet-computer':'ICP',
    'ethereum-classic':'ETC','stellar':'XLM','monero':'XMR','okb':'OKB',
    'hedera-hashgraph':'HBAR','filecoin':'FIL','cosmos':'ATOM','vechain':'VET',
    'tron':'TRX','sui':'SUI','aptos':'APT','sei-network':'SEI',
    'render-token':'RENDER','jupiter-exchange-solana':'JUP','aave':'AAVE',
    'the-graph':'GRT','curve-dao-token':'CRV','maker':'MKR','lido-dao':'LDO',
    'arbitrum':'ARB','optimism':'OP','stacks':'STX','immutable-x':'IMX',
    'injective-protocol':'INJ','blur':'BLUR','bonk':'BONK','dogwifcoin':'WIF',
    'book-of-meme':'BOME','pepe':'PEPE','ondo-finance':'ONDO',
    'worldcoin-wld':'WLD','pyth-network':'PYTH',
    'jito-governance-token':'JTO','ethena':'ENA',
    'hyperliquid':'HYPE','toncoin':'TON','the-sandbox':'SAND',
    'decentraland':'MANA','axie-infinity':'AXS','gala':'GALA',
    'illuvium':'ILV','stepn':'GMT','flow':'FLOW','wax':'WAXP',
    'ocean-protocol':'OCEAN','fetch-ai':'FET','singularitynet':'AGIX',
    'numeraire':'NMR','bittensor':'TAO','zetachain':'ZETA',
    'celestia':'TIA','dymension':'DYM','altlayer':'ALT',
    'omni-network':'OMNI','saga-2':'SAGA','manta-network':'MANTA',
    'mew':'MEW','nyan-heroes':'NYAN','parcl':'PRCL',
    'io-net':'IO','kamino':'KMNO','meteora':'MET','drift-protocol':'DRIFT',
    'marginfi':'MRGN','raydium':'RAY','orca':'ORCA','lifinity':'LFNTY',
    'saber':'SBR','serum':'SRM','wormhole':'W','layerzero':'ZRO',
    'across-protocol':'ACX','synapse-2':'SYN','stargate-finance':'STG',
    'gmx':'GMX','gains-network':'GNS','kwenta':'KWENTA',
    'polynomial-protocol':'POL','vertex-protocol':'VRTX',
    'pendle':'PENDLE','spectra-finance':'SPECTRA','time-wonderland':'TIME',
    'convex-finance':'CVX','frax-share':'FXS'
  };

  function lbl(id){ return LABELS[id]||id.toUpperCase().slice(0,6); }
  function $(id){ return document.getElementById(id); }
  function set(id,v){ var e=$(id); if(e) e.textContent=v; }

  /* ── Coin image lookup with comprehensive fallbacks ── */
  var CG_IDS = {
    'bitcoin':'1','ethereum':'279','binancecoin':'825','solana':'4128',
    'ripple':'44','dogecoin':'5','cardano':'975','avalanche-2':'12559',
    'shiba-inu':'11939','chainlink':'877','polkadot':'12171','bitcoin-cash':'780',
    'near':'10365','litecoin':'2','uniswap':'12504','tron':'1094',
    'stellar':'100','monero':'69','cosmos':'3861','vechain':'3077',
    'filecoin':'12817','aave':'7278','maker':'1364','lido-dao':'13573',
    'arbitrum':'16547','optimism':'25244','injective-protocol':'7226',
    'ondo-finance':'26580','toncoin':'17980','fetch-ai':'3773',
    'singularitynet':'2token','render-token':'11636','hedera-hashgraph':'4642',
    'aptos':'21794','sui':'26375','internet-computer':'8916',
    'ethereum-classic':'3897','okb':'8267','stacks':'4847',
    'immutable-x':'17233','blur':'16925','bonk':'23095','pepe':'29850',
    'worldcoin-wld':'25942','pyth-network':'28177','ethena':'28028',
    'hyperliquid':'29835','the-sandbox':'12129','decentraland':'1966',
    'flow':'4558','ocean-protocol':'3911','bittensor':'22974',
    'celestia':'22861','raydium':'8526','jito-governance-token':'28541',
    'pendle':'18735','curve-dao-token':'12124','the-graph':'6719',
    'wormhole':'26997','layerzero':'30668','stargate-finance':'18934',
    'gmx':'11857','axie-infinity':'8715','gala':'12493'
  };

  function getCoinImage(id) {
    /* Try live coins array first */
    if (typeof coins !== 'undefined' && Array.isArray(coins) && coins.length > 0) {
      var found = coins.find(function(x) { return x.id === id; });
      if (found && found.image) return found.image;
    }
    /* Fallback: CoinGecko small thumb URL */
    var cgId = CG_IDS[id];
    if (cgId) return 'https://assets.coingecko.com/coins/images/' + cgId + '/thumb/' + id + '.png';
    /* Last resort: return empty — let onerror handler hide the img */
    return '';
  }

  function updateIcons() {
    var fi = $('rt-from-icon'), ti = $('rt-to-icon');
    if (fi && S.from) { fi.src = getCoinImage(S.from); fi.style.opacity = '1'; }
    if (ti && S.to)   { ti.src = getCoinImage(S.to);   ti.style.opacity = '1'; }
    if (typeof coins === 'undefined' || !coins.length) {
      setTimeout(updateIcons, 1500);
    }
  }

  function status(msg,cls){
    var e=$('rt-status'); if(!e) return;
    e.textContent=msg; e.className='rt-status'+(cls?' '+cls:'');
  }

  function fmtP(n){
    if(!n) return '—';
    if(n>=100) return '$'+n.toFixed(2);
    if(n>=1)   return '$'+n.toFixed(3);
    if(n>=0.01)return '$'+n.toFixed(4);
    return '$'+n.toFixed(6);
  }

  /* ── Persistence ─────────────────────────────────────────────── */
  function savePair(){ try{ localStorage.setItem(LS_PAIR,JSON.stringify({from:S.from,to:S.to})); }catch(e){} }
  function loadPair(){ try{ var r=localStorage.getItem(LS_PAIR); if(r) return JSON.parse(r); }catch(e){} return null; }
  function loadSaved(){ try{ var r=localStorage.getItem(LS_SAVED); if(r) S.saved=JSON.parse(r); }catch(e){} if(!Array.isArray(S.saved)) S.saved=[]; }
  function persistSaved(){ try{ localStorage.setItem(LS_SAVED,JSON.stringify(S.saved)); }catch(e){} }
  function isSaved(f,t){ return S.saved.some(function(p){ return p.from===f&&p.to===t; }); }

  function saveFavourite(){
    if(!S.from||!S.to) return;
    if(isSaved(S.from,S.to)) return;
    if(S.saved.length>=8){ status('Max 8 saved pairs — remove one first','warn'); return; }
    S.saved.push({from:S.from,to:S.to});
    persistSaved(); renderSavedPairs(); updateStarBtn();
  }

  function removeFavourite(f,t){
    S.saved=S.saved.filter(function(p){ return !(p.from===f&&p.to===t); });
    persistSaved(); renderSavedPairs(); updateStarBtn();
  }

  function loadFavourite(f,t){
    var fSel=$('rt-from'); if(!fSel) return;
    if(!fSel.querySelector('option[value="'+f+'"]')){
      var o=document.createElement('option'); o.value=f; o.textContent=lbl(f)+'  —  '+f; fSel.appendChild(o);
    }
    fSel.value=f; S.from=f;
    buildToDropdown(f);
    var tSel=$('rt-to');
    if(!tSel.querySelector('option[value="'+t+'"]')){
      var o2=document.createElement('option'); o2.value=t; o2.textContent=lbl(t)+'  —  '+t; tSel.appendChild(o2);
    }
    tSel.value=t; S.to=t;
    savePair(); renderSavedPairs(); updateStarBtn();
    updateLabels(); updateIcons();   /* FIX: immediate visual update before async load */
    loadAll(true);
  }

  /* ── Dropdowns ───────────────────────────────────────────────── */
  function buildFromDropdown(){
    var sel=$('rt-from'); if(!sel) return;
    sel.innerHTML='';
    var holdIds=(typeof holdings!=='undefined'?holdings:[]).map(function(h){return h.sym;}).filter(function(id){return LABELS[id];});
    if(holdIds.length){
      var g=document.createElement('optgroup'); g.label='My Holdings';
      holdIds.forEach(function(id){ var o=document.createElement('option'); o.value=id; o.textContent=lbl(id)+'  —  '+id; g.appendChild(o); });
      sel.appendChild(g);
    }
    var g2=document.createElement('optgroup'); g2.label='All Coins';
    FREE_COINS.forEach(function(id){
      if(holdIds.indexOf(id)>=0) return;
      var o=document.createElement('option'); o.value=id; o.textContent=lbl(id)+'  —  '+id; g2.appendChild(o);
    });
    sel.appendChild(g2);
    var saved=loadPair();
    if(saved&&saved.from&&sel.querySelector('option[value="'+saved.from+'"]')) sel.value=saved.from;
    else if(sel.querySelector('option[value="binancecoin"]')) sel.value='binancecoin';
    else if(holdIds.length) sel.value=holdIds[0];
    else sel.value=FREE_COINS[0];
    S.from=sel.value;
  }

  function buildToDropdown(skipId){
    var sel=$('rt-to'); if(!sel) return;
    sel.innerHTML='';
    var g=document.createElement('optgroup'); g.label='All Coins';
    FREE_COINS.forEach(function(id){
      if(id===skipId) return;
      var o=document.createElement('option'); o.value=id; o.textContent=lbl(id)+'  —  '+id; g.appendChild(o);
    });
    sel.appendChild(g);
    var saved=loadPair();
    if(saved&&saved.to&&saved.to!==skipId&&sel.querySelector('option[value="'+saved.to+'"]')) sel.value=saved.to;
    else{ var d=['solana','ethereum','ondo-finance','bitcoin'].find(function(x){return x!==skipId;})||FREE_COINS.find(function(x){return x!==skipId;}); sel.value=d; }
    S.to=sel.value;
  }

  function updateLabels(){
    var f=S.from,t=S.to; if(!f||!t) return;
    set('rt-unit-txt',lbl(t)+' received per 1 '+lbl(f));
    set('rt-from-card-lbl',lbl(f)); set('rt-to-card-lbl',lbl(t));
    set('rt-calc-from-lbl','Amount of '+lbl(f));
    var fs=$('rt-ct-from-sym'); if(fs) fs.textContent=lbl(f);
    var ts=$('rt-ct-to-sym');   if(ts) ts.textContent=lbl(t);
    updateIcons();
  }

  function updateStarBtn(){
    var btn=$('rt-star-btn'); if(!btn) return;
    var saved=isSaved(S.from,S.to);
    btn.textContent=saved?'★ Saved':'☆ Save pair';
    btn.classList.toggle('rt-star-active',saved);
    btn.onclick=saved?function(){removeFavourite(S.from,S.to);}:function(){saveFavourite();};
  }

  function renderSavedPairs(){
    var wrap=$('rt-saved-wrap'); if(!wrap) return;
    if(!S.saved.length){
      wrap.innerHTML='<span class="rt-saved-empty">No saved pairs yet — pick a pair and click ☆ Save pair</span>';
      return;
    }
    wrap.innerHTML=S.saved.map(function(p){
      var active=(p.from===S.from&&p.to===S.to);
      return '<button class="rt-saved-chip'+(active?' active':'')+'" onclick="RatioTracker._loadFav(\''+p.from+'\',\''+p.to+'\')">'
        +lbl(p.from)+' → '+lbl(p.to)
        +'<span class="rt-chip-x" onclick="event.stopPropagation();RatioTracker._removeFav(\''+p.from+'\',\''+p.to+'\')">×</span>'
        +'</button>';
    }).join('');
  }

  /* ── Data loading ────────────────────────────────────────────── */
  function _coinFromCache(id){
    if(typeof coins!=='undefined'&&Array.isArray(coins)){
      var c=coins.find(function(x){return x.id===id;});
      if(c&&c.price>0) return {usd:c.price, chg:c.p24||0};
    }
    return null;
  }

  async function loadPrices(){
    var f=S.from,t=S.to;
    var fc=_coinFromCache(f), tc=_coinFromCache(t);

    if(fc&&tc){
      S.fromPrice=fc.usd; S.toPrice=tc.usd;
      S.fromChg=fc.chg;   S.toChg=tc.chg;
    } else {
      var raw=await apiFetch('https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids='+f+','+t);
      var fo=raw[f],to=raw[t];
      if(!fo||fo.usd===undefined) throw new Error(lbl(f)+' price missing');
      if(!to||to.usd===undefined) throw new Error(lbl(t)+' price missing');
      S.fromPrice=fo.usd; S.toPrice=to.usd;
      S.fromChg=fo.usd_24h_change||0; S.toChg=to.usd_24h_change||0;
    }
    var ratio=S.fromPrice/S.toPrice;

    var rEl=$('rt-ratio-num');
    if(rEl){ rEl.textContent=ratio.toFixed(ratio<1?4:ratio<10?3:2); rEl.classList.remove('dim'); rEl.classList.add('rt-ratio-bold'); }

    var fromSym=$('rt-ct-from-sym'); if(fromSym) fromSym.textContent=lbl(S.from);
    set('rt-from-price', fmtP(S.fromPrice));
    var fChgEl=$('rt-from-chg');
    if(fChgEl){
      fChgEl.textContent=(S.fromChg>=0?'+':'')+S.fromChg.toFixed(2)+'% 24h';
      fChgEl.style.color=S.fromChg>=0?'var(--green)':'var(--red)';
    }

    var toSym=$('rt-ct-to-sym'); if(toSym) toSym.textContent=lbl(S.to);
    set('rt-to-price', fmtP(S.toPrice));
    var tChgEl=$('rt-to-chg');
    if(tChgEl){
      tChgEl.textContent=(S.toChg>=0?'+':'')+S.toChg.toFixed(2)+'% 24h';
      tChgEl.style.color=S.toChg>=0?'var(--green)':'var(--red)';
    }

    var nowVal=$('rt-now-ratio-val');
    if(nowVal){ nowVal.textContent=ratio.toFixed(ratio<1?4:ratio<10?3:2)+'×'; }

    renderBadge(ratio); calcSwap();
  }

  async function loadHistory(){
    var f=S.from,t=S.to,d=S.days,ckey=f+'|'+t+'|'+d;
    var cached=S.histCache[ckey];
    if(cached&&(Date.now()-cached.ts)<10*60*1000){ renderChart(cached.series); renderRange(cached.series); return; }
    status('Loading '+(d===1?'24h':d+'d')+' chart…','');
    setTfDisabled(true);
    try{
      var base='https://api.coingecko.com/api/v3/coins/',sfx='/market_chart?vs_currency=usd&days='+d;
      var rawF=await apiFetch(base+f+sfx),fp=rawF&&rawF.prices;
      if(!fp) throw new Error(lbl(f)+' chart missing');
      await (typeof sleep==='function'?sleep(400):new Promise(function(r){setTimeout(r,400);}));
      var rawT=await apiFetch(base+t+sfx),tp=rawT&&rawT.prices;
      if(!tp) throw new Error(lbl(t)+' chart missing');
      var len=Math.min(fp.length,tp.length),series=[];
      for(var i=0;i<len;i++) if(tp[i][1]>0) series.push({t:fp[i][0],r:fp[i][1]/tp[i][1]});
      S.histCache[ckey]={ts:Date.now(),series:series}; S.series=series;
      renderChart(series); renderRange(series);
      status('Updated '+new Date().toLocaleTimeString(),'ok');
    }catch(e){ status('Chart error: '+e.message,'err'); }
    setTfDisabled(false);
  }

  var _loadGen = 0;  /* generation counter — newer loadAll() cancels stale in-flight loads */

  async function loadAll(forceRefresh){
    if(forceRefresh){
      S.loading = false;          /* allow re-entry when caller forces refresh */
      _loadGen++;                 /* invalidate any in-flight load */
    }
    if(S.loading) return; S.loading=true;
    var gen = ++_loadGen;         /* capture generation for staleness checks */

    if(forceRefresh){
      /* bust hist cache for current pair so chart fetches fresh data */
      var ck = S.from+'|'+S.to+'|'+S.days;
      delete S.histCache[ck];
    }

    setSpin(true); status('Fetching prices…'); updateLabels(); updateIcons();
    try{
      await loadPrices();
      if(gen !== _loadGen){ S.loading=false; return; }   /* superseded */
      updateIcons();
      await new Promise(function(r){setTimeout(r,300);});
      if(gen !== _loadGen){ S.loading=false; return; }   /* superseded */
      await loadHistory();
    }catch(e){ if(gen === _loadGen) status('Error: '+e.message,'err'); }
    if(gen === _loadGen){ setSpin(false); }
    S.loading=false;
    updateIcons();
  }

  /* ── Rendering ───────────────────────────────────────────────── */
  function renderBadge(ratio){
    if(!S.series||!S.series.length) return;
    var vals=S.series.map(function(p){return p.r;}),sorted=vals.slice().sort(function(a,b){return a-b;});
    var pct=sorted.filter(function(v){return v<=ratio;}).length/sorted.length;
    var el=$('rt-badge'); if(!el) return;
    if(pct>=0.80)      {el.textContent='↑ Great time to swap';            el.style.background='rgba(0,189,142,0.12)';  el.style.color='var(--green)'; el.style.borderColor='rgba(0,189,142,0.25)';}
    else if(pct>=0.50) {el.textContent='◈ Decent — above average';        el.style.background='rgba(167,139,250,0.1)'; el.style.color='var(--pro)';   el.style.borderColor='rgba(167,139,250,0.25)';}
    else if(pct>=0.25) {el.textContent='◈ Below period average';          el.style.background='rgba(240,160,48,0.1)';  el.style.color='var(--amber)'; el.style.borderColor='rgba(240,160,48,0.25)';}
    else               {el.textContent='↓ Unfavorable — wait if possible'; el.style.background='rgba(240,62,88,0.1)';  el.style.color='var(--red)';   el.style.borderColor='rgba(240,62,88,0.25)';}
  }

  function renderRange(series){
    if(!series||!series.length) return;
    var vals=series.map(function(p){return p.r;}),minR=Math.min.apply(null,vals),maxR=Math.max.apply(null,vals);
    var nowR=vals[vals.length-1],peakIdx=vals.indexOf(maxR);
    var peakDate=new Date(series[peakIdx].t),startDate=new Date(series[0].t),range=maxR-minR||1;
    set('rt-r-low',minR.toFixed(2)+'x'); set('rt-r-peak',maxR.toFixed(2)+'x'); set('rt-r-now',nowR.toFixed(2)+'x'); set('rt-peak-val',maxR.toFixed(2)+'x');
    var nowPct=Math.max(2,Math.min(98,(nowR-minR)/range*100)),peakPct=peakIdx/Math.max(1,vals.length-1)*100;
    var fill=$('rt-bar-fill'),marker=$('rt-bar-marker');
    if(fill) fill.style.width=nowPct.toFixed(1)+'%'; if(marker) marker.style.left=peakPct.toFixed(1)+'%';
    set('rt-bl-start',(startDate.getMonth()+1)+'/'+startDate.getDate());
    set('rt-bl-peak','▲ '+(S.days===1?peakDate.getHours()+':00':(peakDate.getMonth()+1)+'/'+peakDate.getDate()));
    renderBadge(nowR);
  }

  /* ── FIX BUG 3: Chart rendering with retry for CDN load race + collapsed canvas ── */
  var _chartRetryTimer = null;
  var _chartRetryCount = 0;
  var _pendingChartSeries = null;   /* stash series when canvas has no dimensions */

  function renderChart(series){
    /* Clear any pending retry */
    if(_chartRetryTimer){ clearTimeout(_chartRetryTimer); _chartRetryTimer=null; }

    var canvas=$('rt-spark');
    if(!canvas) return;

    /* Wait for Chart.js to be available from CDN (max ~6s) */
    if(!window.Chart){
      if(_chartRetryCount++ < 20){
        _chartRetryTimer=setTimeout(function(){ renderChart(series); }, 300);
      }
      return;
    }

    /* Wait for canvas to have real dimensions (fails when section is collapsed) */
    var h=canvas.offsetHeight||canvas.clientHeight||0;
    var w=canvas.offsetWidth||canvas.clientWidth||0;
    if(h<10||w<10){
      /* Stash series so it can be drawn when the section opens */
      _pendingChartSeries = series;
      if(_chartRetryCount++ < 20){
        _chartRetryTimer=setTimeout(function(){ renderChart(series); }, 300);
      }
      return;
    }
    _chartRetryCount = 0;
    _pendingChartSeries = null;

    var ctx=canvas.getContext('2d');
    var labels=series.map(function(p){
      var d=new Date(p.t);
      return S.days===1
        ? d.getHours()+':'+String(d.getMinutes()).padStart(2,'0')
        : (d.getMonth()+1)+'/'+d.getDate();
    });
    var rawData=series.map(function(p){return +p.r.toFixed(8);});
    var peakIdx=rawData.indexOf(Math.max.apply(null,rawData));
    var rawMin=Math.min.apply(null,rawData), rawMax=Math.max.apply(null,rawData);

    /* ── Normalize for extreme discrepancies ──
       When the ratio range is tiny relative to the values (e.g. 0.000213 to 0.000215),
       the chart looks flat. Convert to % change from the first value so the shape
       of the movement is visible regardless of absolute scale. */
    var range=rawMax-rawMin;
    var usePercent = rawMin>0 && (range/rawMin < 0.01);  /* less than 1% swing */
    var data, minVal, maxVal, yLabel;
    if(usePercent){
      var baseVal=rawData[0];
      data=rawData.map(function(v){ return +((v/baseVal-1)*100).toFixed(4); });
      minVal=Math.min.apply(null,data);
      maxVal=Math.max.apply(null,data);
      yLabel='%';
    } else {
      data=rawData.map(function(v){return +v.toFixed(4);});
      minVal=rawMin;
      maxVal=rawMax;
      yLabel='×';
    }

    var grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'rgba(0,189,142,0.35)');
    grad.addColorStop(0.4,'rgba(0,189,142,0.18)');
    grad.addColorStop(0.75,'rgba(0,189,142,0.06)');
    grad.addColorStop(1,'rgba(0,189,142,0.01)');

    /* ── Support / Resistance levels for "Best Time to Swap" cues ── */
    var sorted=data.slice().sort(function(a,b){return a-b;});
    var supportLvl  = sorted[Math.floor(sorted.length*0.25)];  /* 25th percentile */
    var resistLvl   = sorted[Math.floor(sorted.length*0.75)];  /* 75th percentile */

    if(S.chart){S.chart.destroy();S.chart=null;}
    S.chart=new Chart(ctx,{
      type:'line',
      data:{
        labels:labels,
        datasets:[{
          data:data,
          borderColor:'#00bd8e',
          borderWidth:2,
          backgroundColor:grad,
          tension:0.45,
          pointRadius:data.map(function(v,i){
            return (i===peakIdx||i===data.length-1)?5:0;
          }),
          pointBackgroundColor:data.map(function(v,i){
            return i===peakIdx?'#f03e58':'#00bd8e';
          }),
          pointBorderColor:data.map(function(v,i){
            return i===peakIdx?'rgba(240,62,88,.3)':'rgba(0,189,142,.3)';
          }),
          pointBorderWidth:data.map(function(v,i){
            return (i===peakIdx||i===data.length-1)?2:0;
          }),
          fill:true
        }]
      },
      plugins:[{
        /* Inline plugin: draw support/resistance dashed lines + labels */
        id:'swapLevels',
        afterDraw:function(chart){
          var yAxis=chart.scales.y; if(!yAxis) return;
          var ctx2=chart.ctx, area=chart.chartArea;
          function drawLevel(val,color,label){
            var y=yAxis.getPixelForValue(val);
            if(y<area.top||y>area.bottom) return;
            ctx2.save();
            ctx2.setLineDash([4,4]);
            ctx2.strokeStyle=color; ctx2.lineWidth=1; ctx2.globalAlpha=0.55;
            ctx2.beginPath(); ctx2.moveTo(area.left,y); ctx2.lineTo(area.right,y); ctx2.stroke();
            ctx2.setLineDash([]);
            ctx2.globalAlpha=0.8; ctx2.font='600 8px IBM Plex Mono,monospace'; ctx2.fillStyle=color;
            ctx2.fillText(label,area.left+4,y-4);
            ctx2.restore();
          }
          drawLevel(resistLvl,'#00bd8e','BEST SWAP ▲');
          drawLevel(supportLvl,'#f0a030','SUPPORT ▼');
        }
      }],
      options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:{duration:400},
        plugins:{
          legend:{display:false},
          tooltip:{
            backgroundColor:'rgba(15,19,24,.96)',
            borderColor:'rgba(243,186,47,.25)',
            borderWidth:1,
            titleColor:'#5a6e85',
            bodyColor:'#dce4f0',
            padding:8,
            callbacks:{
              label:function(c){
                if(usePercent) return ' '+c.parsed.y.toFixed(3)+'%  ('+rawData[c.dataIndex].toFixed(6)+' ratio)';
                return ' '+c.parsed.y.toFixed(3)+'×';
              }
            }
          }
        },
        scales:{
          x:{
            display:true,
            grid:{display:false},
            ticks:{
              font:{size:9,family:'IBM Plex Mono,monospace'},
              color:'rgba(90,110,133,.7)',
              maxTicksLimit:S.days===1?6:8,
              maxRotation:0
            },
            border:{display:false}
          },
          y:{
            display:true,
            position:'right',
            grid:{color:'rgba(255,255,255,.04)',drawBorder:false},
            ticks:{
              font:{size:9,family:'IBM Plex Mono,monospace'},
              color:'rgba(90,110,133,.7)',
              callback:function(v){return usePercent ? v.toFixed(2)+'%' : v.toFixed(2)+'×';},
              maxTicksLimit:4
            },
            border:{display:false},
            min: usePercent ? minVal - Math.max(Math.abs(maxVal-minVal)*0.15, 0.01) : minVal*0.997,
            max: usePercent ? maxVal + Math.max(Math.abs(maxVal-minVal)*0.15, 0.01) : maxVal*1.003
          }
        }
      }
    });
  }

  function fmtRatio(v){
    if(v>=1000) return v.toLocaleString('en-US',{maximumFractionDigits:2});
    if(v>=1)    return v.toLocaleString('en-US',{maximumFractionDigits:4});
    if(v>=0.01) return v.toLocaleString('en-US',{maximumFractionDigits:6});
    return v.toLocaleString('en-US',{maximumFractionDigits:8});
  }

  function calcSwap(){
    var amtEl=$('rt-calc-amt'),ovFEl=$('rt-calc-from-ov'),ovTEl=$('rt-calc-to-ov'); if(!amtEl) return;
    var amt=parseFloat(amtEl.value)||0,ovF=parseFloat(ovFEl?ovFEl.value:''),ovT=parseFloat(ovTEl?ovTEl.value:'');
    var fp=(!isNaN(ovF)&&ovF>0)?ovF:S.fromPrice,tp=(!isNaN(ovT)&&ovT>0)?ovT:S.toPrice;
    if(!fp||!tp||amt<=0) return;
    var outAmt = amt*(fp/tp);
    var outFmt = fmtRatio(outAmt);
    set('rt-calc-out', outFmt + ' ' + lbl(S.to));
    set('rt-calc-usd-out','$'+(amt*fp).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));

    var fwd=fp/tp, inv=tp/fp;
    var fwdEl=$('rt-calc-ratio-fwd'), invEl=$('rt-calc-ratio-inv');
    if(fwdEl) fwdEl.innerHTML='1 '+lbl(S.from)+' = <span>'+fmtRatio(fwd)+' '+lbl(S.to)+'</span>';
    if(invEl) invEl.innerHTML='1 '+lbl(S.to)+' = <span>'+fmtRatio(inv)+' '+lbl(S.from)+'</span>';
  }

  /* ── Controls ────────────────────────────────────────────────── */
  function setTF(days){
    if(S.loading) return; S.days=days;
    [1,7,30].forEach(function(d){var b=$('rt-tf-'+d);if(b)b.classList.toggle('active',d===days);});
    loadHistory();
  }
  function setSpin(on){ var i=$('rt-spin-icon'),b=$('rt-refresh-btn'); if(i)i.className=on?'spinning':''; if(b)b.disabled=on; }
  function setTfDisabled(v){ [1,7,30].forEach(function(d){var b=$('rt-tf-'+d);if(b)b.disabled=v;}); }

  /* ── FIX BUG 2: Swap FROM ↔ TO — instant visual flip before async reload ── */
  function swapPair(){
    var newFrom=S.to, newTo=S.from;
    S.from=newFrom; S.to=newTo;
    savePair();

    /* Update hidden selects */
    var fs=$('rt-from');
    if(fs) fs.value=S.from;
    buildToDropdown(S.from);
    var ts=$('rt-to');
    if(ts){
      if(!ts.querySelector('option[value="'+S.to+'"]')){
        var o=document.createElement('option'); o.value=S.to; o.textContent=lbl(S.to)+'  —  '+S.to; ts.appendChild(o);
      }
      ts.value=S.to;
    }

    /* FIX: Immediately update all card labels + icons so the UI flips at once.
       Also swap the displayed price/chg values so the cards look correct
       while loadAll() fetches fresh data in the background. */
    var prevFromPrice = S.fromPrice, prevFromChg = S.fromChg;
    var prevToPrice   = S.toPrice,   prevToChg   = S.toChg;
    S.fromPrice = prevToPrice;   S.fromChg = prevToChg;
    S.toPrice   = prevFromPrice; S.toChg   = prevFromChg;

    updateLabels(); /* refreshes sym labels + icons */

    /* Swap the price/chg text in the cards immediately */
    set('rt-from-price', S.fromPrice ? fmtP(S.fromPrice) : '—');
    set('rt-to-price',   S.toPrice   ? fmtP(S.toPrice)   : '—');
    var fChgEl=$('rt-from-chg');
    if(fChgEl&&S.fromChg!=null){
      fChgEl.textContent=(S.fromChg>=0?'+':'')+S.fromChg.toFixed(2)+'% 24h';
      fChgEl.style.color=S.fromChg>=0?'var(--green)':'var(--red)';
    }
    var tChgEl=$('rt-to-chg');
    if(tChgEl&&S.toChg!=null){
      tChgEl.textContent=(S.toChg>=0?'+':'')+S.toChg.toFixed(2)+'% 24h';
      tChgEl.style.color=S.toChg>=0?'var(--green)':'var(--red)';
    }

    /* If we have a valid inverted ratio, show it immediately */
    if(S.fromPrice&&S.toPrice){
      var ratio=S.fromPrice/S.toPrice;
      var rEl=$('rt-ratio-num');
      if(rEl) rEl.textContent=ratio.toFixed(ratio<1?4:ratio<10?3:2);
      var nowVal=$('rt-now-ratio-val');
      if(nowVal) nowVal.textContent=ratio.toFixed(ratio<1?4:ratio<10?3:2)+'×';
      calcSwap();
    }

    updateStarBtn(); renderSavedPairs();

    /* Animate the swap button */
    var swapBtn=document.querySelector('.new-swap-dir-btn');
    if(swapBtn){ swapBtn.style.transform='scale(.88) rotate(180deg)'; setTimeout(function(){ swapBtn.style.transform=''; },350); }
    var arrEl=document.querySelector('.rt-swap-arrows');
    if(arrEl){ arrEl.style.transform='rotate(180deg)'; setTimeout(function(){ arrEl.style.transform=''; },400); }

    /* Reload in background for fresh server data — force refresh to bust cache + cancel stale loads */
    loadAll(true);
  }

  /* ── FIX BUG 1: Custom coin picker — clean single-listener pattern ──
     The original code attached a document capture listener on every open
     call without guaranteeing removal, causing stale handlers to fire
     and making the entire panel feel like a giant button.
     New pattern: one named handler, always removed before re-attaching,
     with a robust guard that checks visibility before acting.          */
  var _pickerMode = 'from';
  var _pickerOutsideHandler = null;

  function _removeOutsideHandler(){
    if(_pickerOutsideHandler){
      document.removeEventListener('mousedown', _pickerOutsideHandler, true);
      document.removeEventListener('touchstart', _pickerOutsideHandler, true); /* works for both {capture:true} and true */
      _pickerOutsideHandler = null;
    }
  }

  var _pickerOpenTime = 0;

  function _openPicker(mode){
    /* Pro gate: only Pro users can change coins */
    if (typeof isPro !== 'undefined' && !isPro) {
      if (typeof openPro === 'function') openPro();
      return;
    }
    _pickerMode = mode;
    var panel = $('rt-picker-panel'); if(!panel) return;
    var title = $('rt-picker-title'); if(title) title.textContent='Select '+mode.toUpperCase()+' asset';
    var search = $('rt-picker-search'); if(search) search.value='';

    /* Remove any stale listener before showing panel */
    _removeOutsideHandler();

    panel.style.display = 'flex';
    _pickerOpenTime = Date.now();
    _pickerFilter();
    if(search) setTimeout(function(){ search.focus(); }, 120);

    _pickerOutsideHandler = function(e){
      /* Ignore events that fire within 200ms of open (prevents touch race) */
      if(Date.now() - _pickerOpenTime < 200) return;
      var p = $('rt-picker-panel');
      /* Guard: only act if panel is actually visible */
      if(!p || p.style.display === 'none') { _removeOutsideHandler(); return; }
      /* Don't close if the click/touch is inside the panel itself */
      if(p.contains(e.target)) return;
      /* Don't close if the click is on one of the coin cards (they re-open the picker) */
      var card = e.target.closest ? (e.target.closest('.new-from-card') || e.target.closest('.new-to-card')) : null;
      if(card) return;
      e.preventDefault();
      _closePicker();
    };

    /* Attach outside listener with a longer delay to avoid same-tap race */
    setTimeout(function(){
      document.addEventListener('mousedown', _pickerOutsideHandler, true);
      document.addEventListener('touchstart', _pickerOutsideHandler, {capture:true, passive:false});
    }, 220);
  }

  function _closePicker(){
    var panel = $('rt-picker-panel'); if(panel) panel.style.display = 'none';
    _removeOutsideHandler();
  }

  function _pickerFilter(){
    var q=($('rt-picker-search')||{value:''}).value.toLowerCase().trim();
    var list=$('rt-picker-list'); if(!list) return;
    var cArr=(typeof coins!=='undefined'&&Array.isArray(coins)&&coins.length)?coins:[];
    if(!cArr.length){ list.innerHTML='<div style="padding:14px;text-align:center;font-size:12px;color:var(--muted);">Loading coins…</div>'; return; }
    var filtered=q?cArr.filter(function(x){ return x.sym.toLowerCase().includes(q)||(x.name||'').toLowerCase().includes(q); }):cArr.slice(0,60);
    var curId=(_pickerMode==='from'?S.from:S.to);
    list.innerHTML=filtered.slice(0,60).map(function(coin){
      var sel=coin.id===curId;
      var p24c=coin.p24>=0?'var(--green)':'var(--red)';
      return '<div class="rt-picker-item'+(sel?' selected':'')+'" onclick="RatioTracker._pickerSelect(\''+coin.id+'\')">'+
        '<img class="rt-picker-ico" src="'+coin.image+'" alt="" onerror="this.style.opacity=\'0\'">'+
        '<span class="rt-picker-sym">'+coin.sym+'</span>'+
        '<span class="rt-picker-name">'+(coin.name||'')+'</span>'+
        '<span class="rt-picker-price" style="color:'+p24c+'">'+(coin.p24>=0?'+':'')+coin.p24.toFixed(1)+'%</span>'+
        '</div>';
    }).join('');
  }

  function _pickerSelect(coinId){
    if(_pickerMode==='from'){
      var fs=$('rt-from');
      if(fs){
        /* Ensure the option exists in the hidden select before setting value */
        if(!fs.querySelector('option[value="'+coinId+'"]')){
          var o=document.createElement('option'); o.value=coinId; o.textContent=lbl(coinId)+'  —  '+coinId; fs.appendChild(o);
        }
        fs.value=coinId; S.from=coinId;
      }
      buildToDropdown(S.from);
      var ts=$('rt-to'); if(ts) S.to=ts.value;
      onFromChange();
    } else {
      var ts=$('rt-to');
      if(ts){
        /* Ensure the option exists in the hidden select before setting value */
        if(!ts.querySelector('option[value="'+coinId+'"]')){
          var o=document.createElement('option'); o.value=coinId; o.textContent=lbl(coinId)+'  —  '+coinId; ts.appendChild(o);
        }
        ts.value=coinId; S.to=coinId;
      }
      onToChange();
    }
    _closePicker();
  }

  function onFromChange(){
    var sel=$('rt-from'); if(!sel) return;
    S.from=sel.value; buildToDropdown(S.from); S.to=$('rt-to').value;
    savePair(); updateStarBtn(); renderSavedPairs();
    updateLabels(); updateIcons();   /* FIX: immediate visual update */
    loadAll(true);
  }
  function onToChange(){
    var sel=$('rt-to'); if(!sel) return;
    S.to=sel.value; savePair(); updateStarBtn(); renderSavedPairs();
    updateLabels(); updateIcons();   /* FIX: immediate visual update */
    loadAll(true);
  }

  /* ── Re-render chart when collapsed section becomes visible ── */
  function _watchCollapseOpen(){
    var body=$('cb-swap');
    if(!body) return;
    var obs=new MutationObserver(function(){
      if(!body.classList.contains('collapsed') && _pendingChartSeries && _pendingChartSeries.length){
        _chartRetryCount=0;
        setTimeout(function(){ renderChart(_pendingChartSeries); }, 120);
      }
    });
    obs.observe(body,{attributes:true,attributeFilter:['class']});
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init(){
    loadSaved(); buildFromDropdown(); buildToDropdown(S.from);
    var saved=loadPair();
    if(saved&&saved.to&&saved.to!==S.from){
      var tSel=$('rt-to');
      if(tSel&&tSel.querySelector('option[value="'+saved.to+'"]')){ tSel.value=saved.to; S.to=saved.to; }
    }
    updateLabels(); updateIcons(); renderSavedPairs(); updateStarBtn();
    _watchCollapseOpen();
    loadAll(false);
  }

  function refresh(){
    var fSel=$('rt-from'),prev=fSel?fSel.value:null;
    buildFromDropdown();
    if(prev&&fSel&&fSel.querySelector('option[value="'+prev+'"]')){ fSel.value=prev; S.from=prev; }
    buildToDropdown(S.from);
    var tSel=$('rt-to');
    if(tSel&&S.to&&tSel.querySelector('option[value="'+S.to+'"]')) tSel.value=S.to;
    else if(tSel) S.to=tSel.value;
    updateLabels(); updateIcons(); updateStarBtn();
  }

  return {
    init:init, refresh:refresh, setTF:setTF,
    loadAll:function(force){loadAll(force!==undefined?force:true);},
    onFromChange:onFromChange, onToChange:onToChange, calcSwap:calcSwap,
    swapPair:swapPair,
    _loadFav:loadFavourite, _removeFav:removeFavourite,
    _openPicker:_openPicker, _closePicker:_closePicker, _pickerFilter:_pickerFilter, _pickerSelect:_pickerSelect,
    getState:function(){ return { from:S.from, to:S.to, fromPrice:S.fromPrice, toPrice:S.toPrice, series:S.series||[] }; },
    lbl:lbl
  };

})();

document.addEventListener('DOMContentLoaded',function(){
  setTimeout(function(){RatioTracker.init();},120);
});

/* ── Share Rotator ── */
function shareRotation() {
  var url   = 'https://rotatortool-official.github.io';
  var title = 'Rotator — Free Crypto Rotation Screener';
  var text  = 'I use Rotator to time my crypto rotations — real-time signals and momentum scores for 200+ coins, completely free.\n\nStop guessing when to swap. Let the data decide.';

  /* Try native Web Share API first (mobile + modern browsers) */
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(function(){});
    return;
  }

  /* Desktop fallback: show a small share menu */
  var existing = document.getElementById('share-menu');
  if (existing) { existing.remove(); return; }

  var menu = document.createElement('div');
  menu.id = 'share-menu';
  menu.className = 'share-menu';
  menu.innerHTML =
      '<button onclick="window.open(\'https://x.com/intent/tweet?text=' + encodeURIComponent(text + '\n\n' + url) + '\',\'_blank\',\'width=600,height=400\');document.getElementById(\'share-menu\').remove()">\uD835\uDD4F Post on X</button>'
    + '<button onclick="window.open(\'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text) + '\',\'_blank\',\'width=600,height=400\');document.getElementById(\'share-menu\').remove()">\u2708 Telegram</button>'
    + '<button onclick="window.open(\'https://reddit.com/submit?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title) + '\',\'_blank\',\'width=600,height=600\');document.getElementById(\'share-menu\').remove()">\u25C9 Reddit</button>'
    + '<button onclick="navigator.clipboard.writeText(\'' + text.replace(/'/g,"\\'") + '\\n' + url + '\').then(function(){this.textContent=\'Copied!\';var s=this;setTimeout(function(){document.getElementById(\'share-menu\')&&document.getElementById(\'share-menu\').remove()},800)}.bind(this))">\uD83D\uDCCB Copy link</button>';

  var btn = document.getElementById('share-rotator-btn');
  btn.parentElement.style.position = 'relative';
  btn.parentElement.appendChild(menu);

  /* Close on outside click */
  setTimeout(function(){
    document.addEventListener('click', function _close(e) {
      var m = document.getElementById('share-menu');
      if (m && !m.contains(e.target) && e.target.id !== 'share-rotator-btn') {
        m.remove();
        document.removeEventListener('click', _close);
      }
    });
  }, 10);
}

/* ══════════════════════════════════════════════════════════════════
   SHARE CARD #2 — SWAP CALCULATOR share card (canvas image generator)
   ──────────────────────────────────────────────────────────────────
   File:     js/ratio.js
   Function: shareSwapCard()
   Trigger:  "Share" button in swap panel top actions (onclick)
             "Share Swap" button inside swap calculator card
   Context:  Swap Calculator — ratio tracking between two coins
   Card:     1080×1080 (square, social-optimized) — shows:
               • Pair title (FROM → TO) + badge (Great/Unfavorable)
               • Current ratio (large display) + % of peak
               • Swap result card (SEND amount → RECEIVE amount + USD)
               • Mini ratio history chart with support/resistance lines,
                 peak (green dot), low (red dot), current (gold dot)
               • Dynamic viral hook (gain % vs period low)
               • CTA hook + ROTATOR branding + referral URL
   Modal:    Reuses viral-share-modal (#viral-share-modal)
             Temporarily overrides _viralCopyTemplates with swap-specific
             messages, restores originals when modal closes.

   ⚠ There is a SECOND share card for Coin/Holdings — see:
      js/data-loaders.js → shareAsImage()
══════════════════════════════════════════════════════════════════ */
function shareSwapCard() {
  var st = RatioTracker.getState();
  if (!st.from || !st.to) return;
  var fromSym = RatioTracker.lbl(st.from);
  var toSym   = RatioTracker.lbl(st.to);

  /* Read UI values */
  var amtEl   = document.getElementById('rt-calc-amt');
  var outEl   = document.getElementById('rt-calc-out');
  var usdEl   = document.getElementById('rt-calc-usd-out');
  var peakEl  = document.getElementById('rt-peak-val');
  var nowEl   = document.getElementById('rt-now-ratio-val');
  var badgeEl = document.getElementById('rt-badge');

  var amount  = amtEl  ? amtEl.value : '100';
  var output  = outEl  ? outEl.textContent.trim() : '—';
  var usdVal  = usdEl  ? usdEl.textContent.trim() : '';
  var peakR   = peakEl ? peakEl.textContent.trim() : '—';
  var nowR    = nowEl  ? nowEl.textContent.trim()  : '—';
  var badge   = badgeEl ? badgeEl.textContent.trim() : '';

  var series  = st.series || [];

  /* ── Canvas 1080×1080 — Binance-style square card ── */
  var W = 1080, H = 1080;
  var can = document.createElement('canvas');
  can.width = W; can.height = H;
  var ctx = can.getContext('2d');

  /* ── Background: deep dark ── */
  var bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0e14');
  bg.addColorStop(0.5, '#101722');
  bg.addColorStop(1, '#0b0e14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* Subtle diagonal noise lines */
  ctx.strokeStyle = 'rgba(243,186,47,0.015)';
  ctx.lineWidth = 1;
  for (var gi = -H; gi < W; gi += 40) { ctx.beginPath(); ctx.moveTo(gi, 0); ctx.lineTo(gi + H, H); ctx.stroke(); }

  /* Top gold accent bar */
  var gold = ctx.createLinearGradient(0, 0, W, 0);
  gold.addColorStop(0, 'rgba(243,186,47,0)');
  gold.addColorStop(0.2, 'rgba(243,186,47,0.9)');
  gold.addColorStop(0.8, 'rgba(243,186,47,0.9)');
  gold.addColorStop(1, 'rgba(243,186,47,0)');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, W, 5);

  /* ── Header row: ROTATOR • SWAP ── */
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText('ROTATOR', 60, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '20px Inter, sans-serif';
  ctx.fillText('•  SWAP', 60 + ctx.measureText('ROTATOR  ').width, 60);

  /* ── Badge (top right) ── */
  if (badge) {
    var isBad = badge.indexOf('Unfavorable') >= 0;
    ctx.textAlign = 'right';
    var badgeW = ctx.measureText(badge).width + 40;
    ctx.fillStyle = isBad ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)';
    _roundRect(ctx, W - 60 - badgeW, 35, badgeW, 38, 8);
    ctx.fill();
    ctx.strokeStyle = isBad ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)';
    ctx.lineWidth = 1;
    _roundRect(ctx, W - 60 - badgeW, 35, badgeW, 38, 8);
    ctx.stroke();
    ctx.fillStyle = isBad ? '#ef4444' : '#10b981';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText(badge, W - 75, 60);
    ctx.textAlign = 'left';
  }

  /* ── Large pair title ── */
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Inter, sans-serif';
  ctx.fillText(fromSym, 60, 140);
  ctx.fillStyle = 'rgba(243,186,47,0.6)';
  ctx.font = '56px Inter, sans-serif';
  var arrowX = 60 + ctx.measureText(fromSym + '  ').width;
  ctx.fillText('→', arrowX, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 64px Inter, sans-serif';
  ctx.fillText(toSym, arrowX + ctx.measureText('→  ').width, 140);

  /* ── Ratio change — Binance PnL style (big number) ── */
  var ratioNow  = parseFloat(nowR)  || 0;
  var ratioPeak = parseFloat(peakR) || 0;
  var ratioPct  = ratioPeak > 0 ? ((ratioNow / ratioPeak) * 100).toFixed(1) : '—';
  var isGoodRatio = ratioNow >= ratioPeak * 0.9;

  /* Big glow behind ratio */
  var glowCol = isGoodRatio ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.06)';
  var ratioGlow = ctx.createRadialGradient(W / 2, 260, 0, W / 2, 260, 300);
  ratioGlow.addColorStop(0, glowCol);
  ratioGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = ratioGlow;
  ctx.fillRect(0, 160, W, 200);

  /* Current ratio — huge display */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '22px Inter, sans-serif';
  ctx.fillText('CURRENT RATIO', W / 2, 200);
  ctx.fillStyle = isGoodRatio ? '#10b981' : '#ef4444';
  ctx.font = 'bold 96px Inter, sans-serif';
  ctx.fillText(nowR, W / 2, 290);
  /* sub-label: vs peak */
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '22px Inter, sans-serif';
  ctx.fillText(ratioPct + '% of peak  (' + peakR + ')', W / 2, 325);
  ctx.textAlign = 'left';

  /* ── Swap result card ── */
  var boxY = 370;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  _roundRect(ctx, 50, boxY, W - 100, 160, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  _roundRect(ctx, 50, boxY, W - 100, 160, 14);
  ctx.stroke();

  /* Send side */
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('SEND', 85, boxY + 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Inter, sans-serif';
  ctx.fillText(amount + ' ' + fromSym, 85, boxY + 82);

  /* Divider arrow */
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(243,186,47,0.5)';
  ctx.font = '36px Inter, sans-serif';
  ctx.fillText('→', W / 2, boxY + 82);
  ctx.textAlign = 'left';

  /* Receive side */
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('RECEIVE', W - 85, boxY + 36);
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 40px Inter, sans-serif';
  ctx.fillText(output, W - 85, boxY + 82);
  if (usdVal) {
    ctx.fillStyle = 'rgba(243,186,47,0.65)';
    ctx.font = '22px Inter, sans-serif';
    ctx.fillText(usdVal, W - 85, boxY + 118);
  }
  ctx.textAlign = 'left';

  /* ── Mini chart (wider, below swap box) ── */
  if (series.length > 2) {
    var chartX = 50, chartY2 = 560, chartW = W - 100, chartH = 200;
    var vals = series.map(function(p) { return p.r; });
    var minV = Math.min.apply(null, vals);
    var maxV = Math.max.apply(null, vals);
    var range = maxV - minV || 1;
    var peakIdx = vals.indexOf(maxV);
    var lowIdx  = vals.indexOf(minV);

    /* Chart bg */
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    _roundRect(ctx, chartX, chartY2, chartW, chartH, 10);
    ctx.fill();

    /* Chart label */
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText('RATIO HISTORY', chartX + 14, chartY2 + 24);

    /* Support line (low) */
    var supportY = chartY2 + chartH - 12 - ((minV - minV) / range) * (chartH - 44);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(239,68,68,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartX + 10, supportY); ctx.lineTo(chartX + chartW - 10, supportY); ctx.stroke();
    /* Resistance line (peak) */
    var resistY = chartY2 + chartH - 12 - ((maxV - minV) / range) * (chartH - 44);
    ctx.strokeStyle = 'rgba(16,185,129,0.35)';
    ctx.beginPath(); ctx.moveTo(chartX + 10, resistY); ctx.lineTo(chartX + chartW - 10, resistY); ctx.stroke();
    ctx.setLineDash([]);

    /* Support/resistance labels */
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(239,68,68,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('LOW ' + minV.toFixed(3) + 'x', chartX + chartW - 14, supportY - 4);
    ctx.fillStyle = 'rgba(16,185,129,0.6)';
    ctx.fillText('PEAK ' + maxV.toFixed(3) + 'x', chartX + chartW - 14, resistY + 14);
    ctx.textAlign = 'left';

    /* Gradient fill under chart */
    ctx.beginPath();
    for (var si = 0; si < vals.length; si++) {
      var px = chartX + 10 + (si / (vals.length - 1)) * (chartW - 20);
      var py = chartY2 + chartH - 12 - ((vals[si] - minV) / range) * (chartH - 44);
      if (si === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    var lastPx = chartX + 10 + ((vals.length - 1) / (vals.length - 1)) * (chartW - 20);
    var lastPy = chartY2 + chartH - 12 - ((vals[vals.length - 1] - minV) / range) * (chartH - 44);
    ctx.lineTo(chartX + chartW - 10, chartY2 + chartH - 12);
    ctx.lineTo(chartX + 10, chartY2 + chartH - 12);
    ctx.closePath();
    var chartGrad = ctx.createLinearGradient(0, chartY2, 0, chartY2 + chartH);
    chartGrad.addColorStop(0, 'rgba(243,186,47,0.15)');
    chartGrad.addColorStop(1, 'rgba(243,186,47,0)');
    ctx.fillStyle = chartGrad;
    ctx.fill();

    /* Line stroke */
    ctx.beginPath();
    ctx.strokeStyle = '#f3ba2f';
    ctx.lineWidth = 2.5;
    for (var si2 = 0; si2 < vals.length; si2++) {
      var px2 = chartX + 10 + (si2 / (vals.length - 1)) * (chartW - 20);
      var py2 = chartY2 + chartH - 12 - ((vals[si2] - minV) / range) * (chartH - 44);
      if (si2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();

    /* Peak marker (green dot) */
    var peakPx = chartX + 10 + (peakIdx / (vals.length - 1)) * (chartW - 20);
    var peakPy = chartY2 + chartH - 12 - ((maxV - minV) / range) * (chartH - 44);
    ctx.beginPath(); ctx.arc(peakPx, peakPy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981'; ctx.fill();

    /* Low marker (red dot) */
    var lowPx = chartX + 10 + (lowIdx / (vals.length - 1)) * (chartW - 20);
    var lowPy = chartY2 + chartH - 12;
    ctx.beginPath(); ctx.arc(lowPx, lowPy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444'; ctx.fill();

    /* Current point (gold dot with glow) */
    ctx.beginPath(); ctx.arc(lastPx, lastPy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f3ba2f'; ctx.fill();
    ctx.beginPath(); ctx.arc(lastPx, lastPy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(243,186,47,0.3)'; ctx.lineWidth = 2; ctx.stroke();
  }

  /* ── Dynamic viral hook — gain vs low ── */
  var viralY = 780;
  if (series.length > 2) {
    var _vals = series.map(function(p) { return p.r; });
    var _low  = Math.min.apply(null, _vals);
    var _now  = _vals[_vals.length - 1];
    var gainPct = _low > 0 ? ((_now - _low) / _low * 100).toFixed(1) : '0';
    var viralHooks = [
      gainPct + '% more value vs period low — timed with Rotator',
      'Locked in ' + gainPct + '% extra gains on this rotation',
      'Swapped at ' + gainPct + '% above the worst entry point'
    ];
    var hookText = viralHooks[Math.floor(Math.random() * viralHooks.length)];

    ctx.fillStyle = 'rgba(16,185,129,0.06)';
    _roundRect(ctx, 50, viralY, W - 100, 52, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(16,185,129,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, 50, viralY, W - 100, 52, 8);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillText('⚡ ' + hookText, W / 2, viralY + 34);
    ctx.textAlign = 'left';
  }

  /* ── CTA bar ── */
  var ctaY = H - 160;
  ctx.fillStyle = 'rgba(243,186,47,0.06)';
  _roundRect(ctx, 50, ctaY, W - 100, 76, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,186,47,0.25)';
  ctx.lineWidth = 1.5;
  _roundRect(ctx, 50, ctaY, W - 100, 76, 10);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(243,186,47,0.9)';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillText('Stop guessing when to swap.', W / 2, ctaY + 32);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.fillText('Let the data decide — free at Rotator', W / 2, ctaY + 62);
  ctx.textAlign = 'left';

  /* ── Footer ── */
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(50, H - 58, W - 100, 1);
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 30px Inter, sans-serif';
  ctx.fillText('ROTATOR', 60, H - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '18px Inter, sans-serif';
  ctx.fillText('Real-time rotation signals & swap calculator', 230, H - 22);
  ctx.fillStyle = 'rgba(243,186,47,0.7)';
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('rotatortool-official.github.io', W - 60, H - 22);
  ctx.textAlign = 'left';

  /* Bottom gold accent */
  ctx.fillStyle = gold;
  ctx.fillRect(0, H - 5, W, 5);

  /* ── Share via viral modal (reuse existing system) ── */
  try {
    can.toBlob(function(blob) {
      if (!blob) return;

      /* Populate the viral share modal */
      _viralBlob = blob;
      _viralSym  = fromSym + '-' + toSym;
      _viralCanvas = can;

      /* Set swap-specific viral copy templates temporarily */
      var origTemplates = _viralCopyTemplates;
      _viralCopyTemplates = [
        function() { return 'I timed my ' + fromSym + ' \u2192 ' + toSym + ' rotation at ' + peakR + ' peak ratio using Rotator \u2014 the free crypto rotation screener.\n\nStop guessing when to swap. Let the data decide.\n\nhttps://rotatortool-official.github.io'; },
        function() { return fromSym + ' \u2192 ' + toSym + ' swap: ' + amount + ' ' + fromSym + ' = ' + output + '\nCurrent ratio: ' + nowR + ' | Peak: ' + peakR + '\n\nTimed with Rotator \u2014 free rotation signals\nhttps://rotatortool-official.github.io'; },
        function() { return '\u26A1 Swapped ' + fromSym + ' to ' + toSym + ' at the right time using Rotator.\n\nPeak ratio: ' + peakR + ' | Now: ' + nowR + '\n\nFree tool, no signup \u2192 https://rotatortool-official.github.io'; }
      ];
      _viralCopyIdx = 0;

      var preview = document.getElementById('viral-share-preview');
      if (preview) {
        var url = URL.createObjectURL(blob);
        preview.innerHTML = '<img src="' + url + '" alt="Swap share card">';
      }
      _updateViralCopy();

      /* Override _getViralCopyData for swap context */
      var origGetData = _getViralCopyData;
      _getViralCopyData = function() {
        return { sym: fromSym + '/' + toSym, score: nowR, chg: peakR, link: 'https://rotatortool-official.github.io' };
      };

      /* Always show share-with-image button */
      var nativeBtn = document.getElementById('viral-native-btn');
      if (nativeBtn) nativeBtn.style.display = 'flex';

      openModal('viral-share-modal');

      /* Restore originals when modal closes */
      var _origClose = closeViralShare;
      closeViralShare = function() {
        _viralCopyTemplates = origTemplates;
        _getViralCopyData = origGetData;
        closeViralShare = _origClose;
        _origClose();
      };
    }, 'image/png');
  } catch(e) {}
}
