/* ══════════════════════════════════════════════════════════════════
   ratio.js  —  Swap Ratio Tracker
   FEATURES:
   • FROM dropdown: user holdings first, then all 100 coins
   • TO dropdown:   all 100 coins (excluding selected FROM)
   • Selected pair saved to localStorage — restored on next visit
   • Saved pairs bar — star to save, click to load, × to remove
   • Chart, range bar, badge, swap calculator
   • Uses apiFetch() from api-pool.js (caching + proxy rotation)
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
    savePair(); renderSavedPairs(); updateStarBtn(); loadAll(true);
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
    else{ var d=['bitcoin','ethereum','solana','ondo-finance'].find(function(x){return x!==skipId;})||FREE_COINS.find(function(x){return x!==skipId;}); sel.value=d; }
    S.to=sel.value;
  }

  function updateLabels(){
    var f=S.from,t=S.to; if(!f||!t) return;
    set('rt-unit-txt',lbl(t)+' received per 1 '+lbl(f));
    set('rt-from-card-lbl',lbl(f)); set('rt-to-card-lbl',lbl(t));
    set('rt-calc-from-lbl','Amount of '+lbl(f));
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
  async function loadPrices(){
    var f=S.from,t=S.to;
    var raw=await apiFetch('https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids='+f+','+t);
    var fo=raw[f],to=raw[t];
    if(!fo||fo.usd===undefined) throw new Error(lbl(f)+' price missing');
    if(!to||to.usd===undefined) throw new Error(lbl(t)+' price missing');
    S.fromPrice=fo.usd; S.toPrice=to.usd;
    S.fromChg=fo.usd_24h_change||0; S.toChg=to.usd_24h_change||0;
    var ratio=S.fromPrice/S.toPrice;
    var rEl=$('rt-ratio-num'); if(rEl){rEl.textContent=ratio.toFixed(2)+'×'; rEl.classList.remove('dim');}
    set('rt-from-price',fmtP(S.fromPrice)); set('rt-to-price',fmtP(S.toPrice));
    var fChg=$('rt-from-chg'),tChg=$('rt-to-chg');
    if(fChg){fChg.textContent=(S.fromChg>=0?'+':'')+S.fromChg.toFixed(2)+'% 24h'; fChg.style.color=S.fromChg>=0?'var(--green)':'var(--red)';}
    if(tChg){tChg.textContent=(S.toChg>=0?'+':'')+S.toChg.toFixed(2)+'% 24h';   tChg.style.color=S.toChg>=0?'var(--green)':'var(--red)';}
    renderBadge(ratio); calcSwap();
  }

  async function loadHistory(){
    var f=S.from,t=S.to,d=S.days,ckey=f+'|'+t+'|'+d;
    var cached=S.histCache[ckey];
    if(cached&&(Date.now()-cached.ts)<5*60*1000){ renderChart(cached.series); renderRange(cached.series); return; }
    status('Loading '+(d===1?'24h':d+'d')+' chart…','');
    setTfDisabled(true);
    try{
      var base='https://api.coingecko.com/api/v3/coins/',sfx='/market_chart?vs_currency=usd&days='+d;
      var rawF=await apiFetch(base+f+sfx),fp=rawF&&rawF.prices;
      if(!fp) throw new Error(lbl(f)+' chart missing');
      await (typeof sleep==='function'?sleep(1200):new Promise(function(r){setTimeout(r,1200);}));
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

  async function loadAll(clearCache){
    if(S.loading) return; S.loading=true;
    if(clearCache) S.histCache={};
    setSpin(true); status('Fetching prices…'); updateLabels();
    try{
      await loadPrices();
      await (typeof sleep==='function'?sleep(800):new Promise(function(r){setTimeout(r,800);}));
      await loadHistory();
    }catch(e){ status('Error: '+e.message,'err'); }
    setSpin(false); S.loading=false;
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

  function renderChart(series){
    var canvas=$('rt-spark'); if(!canvas||!window.Chart) return;
    var labels=series.map(function(p){ var d=new Date(p.t); return S.days===1?d.getHours()+':'+String(d.getMinutes()).padStart(2,'0'):(d.getMonth()+1)+'/'+d.getDate(); });
    var data=series.map(function(p){return +p.r.toFixed(4);}),peakIdx=data.indexOf(Math.max.apply(null,data));
    if(S.chart){S.chart.destroy();S.chart=null;}
    S.chart=new Chart(canvas.getContext('2d'),{type:'line',data:{labels:labels,datasets:[{data:data,borderColor:'var(--green)',borderWidth:1.5,backgroundColor:'rgba(0,189,142,0.07)',tension:0.4,pointRadius:data.map(function(v,i){return(i===peakIdx||i===data.length-1)?4:0;}),pointBackgroundColor:data.map(function(v,i){return i===peakIdx?'#f03e58':'var(--green)';}),fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{backgroundColor:'#141920',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,titleColor:'#5a6e85',bodyColor:'#dce4f0',callbacks:{label:function(c){return ' '+c.parsed.y.toFixed(3)+'×';}}}},scales:{x:{display:true,grid:{display:false},ticks:{font:{size:9},color:'#5a6e85',maxTicksLimit:S.days===1?6:10,maxRotation:0}},y:{display:true,grid:{color:'rgba(255,255,255,0.04)'},ticks:{font:{size:9},color:'#5a6e85',callback:function(v){return v.toFixed(1)+'×';},maxTicksLimit:4}}}}});
  }

  function calcSwap(){
    var amtEl=$('rt-calc-amt'),ovFEl=$('rt-calc-from-ov'),ovTEl=$('rt-calc-to-ov'); if(!amtEl) return;
    var amt=parseFloat(amtEl.value)||0,ovF=parseFloat(ovFEl?ovFEl.value:''),ovT=parseFloat(ovTEl?ovTEl.value:'');
    var fp=(!isNaN(ovF)&&ovF>0)?ovF:S.fromPrice,tp=(!isNaN(ovT)&&ovT>0)?ovT:S.toPrice;
    if(!fp||!tp||amt<=0) return;
    set('rt-calc-out',(amt*(fp/tp)).toLocaleString('en-US',{maximumFractionDigits:2})+' '+lbl(S.to));
    set('rt-calc-usd-out','$'+(amt*fp).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}));
  }

  /* ── Controls ────────────────────────────────────────────────── */
  function setTF(days){
    if(S.loading) return; S.days=days;
    [1,7,30].forEach(function(d){var b=$('rt-tf-'+d);if(b)b.classList.toggle('active',d===days);});
    loadHistory();
  }
  function setSpin(on){ var i=$('rt-spin-icon'),b=$('rt-refresh-btn'); if(i)i.className=on?'spinning':''; if(b)b.disabled=on; }
  function setTfDisabled(v){ [1,7,30].forEach(function(d){var b=$('rt-tf-'+d);if(b)b.disabled=v;}); }

  function onFromChange(){
    var sel=$('rt-from'); if(!sel) return;
    S.from=sel.value; buildToDropdown(S.from); S.to=$('rt-to').value;
    savePair(); updateStarBtn(); renderSavedPairs(); loadAll(true);
  }
  function onToChange(){
    var sel=$('rt-to'); if(!sel) return;
    S.to=sel.value; savePair(); updateStarBtn(); renderSavedPairs(); loadAll(true);
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init(){
    loadSaved(); buildFromDropdown(); buildToDropdown(S.from);
    var saved=loadPair();
    if(saved&&saved.to&&saved.to!==S.from){
      var tSel=$('rt-to');
      if(tSel&&tSel.querySelector('option[value="'+saved.to+'"]')){ tSel.value=saved.to; S.to=saved.to; }
    }
    updateLabels(); renderSavedPairs(); updateStarBtn(); loadAll(false);
  }

  function refresh(){
    var fSel=$('rt-from'),prev=fSel?fSel.value:null;
    buildFromDropdown();
    if(prev&&fSel&&fSel.querySelector('option[value="'+prev+'"]')){ fSel.value=prev; S.from=prev; }
    buildToDropdown(S.from);
    var tSel=$('rt-to');
    if(tSel&&S.to&&tSel.querySelector('option[value="'+S.to+'"]')) tSel.value=S.to;
    else if(tSel) S.to=tSel.value;
    updateLabels(); updateStarBtn();
  }

  return {
    init:init, refresh:refresh, setTF:setTF,
    loadAll:function(){loadAll(true);},
    onFromChange:onFromChange, onToChange:onToChange, calcSwap:calcSwap,
    _loadFav:loadFavourite, _removeFav:removeFavourite
  };

})();

document.addEventListener('DOMContentLoaded',function(){
  setTimeout(function(){RatioTracker.init();},120);
});
