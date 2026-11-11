/* Editorial interpretation of captured observations. No scoring, forecasts or network requests. */
(function (host) {
  'use strict';
  var topics = [
    {id:'market',name:'Market & exchange activity',why:'Compare leadership across crypto and tokenized stocks.'},
    {id:'rates',name:'Fed & macro backdrop',why:'Separate the observed rate level from a new policy decision.'},
    {id:'unlocks',name:'Token unlocks',why:'Explain scheduled supply without assuming it will be sold.'},
    {id:'etf',name:'ETF flows',why:'Put reported institutional flows in context.'},
    {id:'sentiment',name:'Fear & Greed',why:'Describe sentiment without treating it as a forecast.'},
    {id:'news',name:'News & catalysts',why:'Add verified headlines, dates and source links.'}
  ];
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function text(v) { return String(v == null ? '' : v); }
  function esc(v) { return text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function number(v) { return typeof v === 'number' && Number.isFinite(v); }
  function fmt(v) { return number(v) ? v.toLocaleString('en-US',{maximumFractionDigits:2}) : 'not recorded'; }
  function defaults() { return {included:topics.map(function(t){return t.id;}),notes:{},affected:[],graphCount:2}; }
  function capture(w) {
    var now = new Date().toISOString(), assets = (w.coins || []).filter(function(c){return c && c.id && !c.isStable;}).map(function(c){return {id:c.id,symbol:c.sym || c.symbol || c.id,name:c.name || '',market:c.isStock?'Stocks':'Crypto',p7:number(c.p7)?c.p7:null,score:number(c.score)?c.score:null};});
    return copy({capturedAt:now,asOf:w.ROTATOR_RUN && w.ROTATOR_RUN.asOf || null,engine:w.ROTATOR_RUN && w.ROTATOR_RUN.engineVersion || null,assets:assets,
      sentiment:w.fearGreed || null,world:w._worldData || null,worldAgeMs:number(w._worldAgeMs)?w._worldAgeMs:null,etf:w._etfFlows || null,etfAgeMs:number(w._etfAgeMs)?w._etfAgeMs:null,unlocks:w._tokenUnlocks || {}});
  }
  function state(r) { return Object.assign(defaults(),r.story || {},{notes:Object.assign({},r.story && r.story.notes)}); }
  function coverage(r,id) {
    var d=r.storyData || {};
    if(id==='market')return (d.assets || []).some(function(a){return number(a.p7);});
    if(id==='rates')return !!(d.world && d.world.items && d.world.items.fed && number(d.world.items.fed.v));
    if(id==='unlocks')return Object.keys(d.unlocks || {}).length>0;
    if(id==='etf')return ['BTC','ETH'].some(function(a){return d.etf && d.etf[a] && d.etf[a].last && number(d.etf[a].last.total);});
    if(id==='sentiment')return r.fearGreed!=='' && r.fearGreed!=null && Number.isFinite(Number(r.fearGreed));
    return false;
  }
  function targetAssets(r) { var s=state(r),all=r.storyData && r.storyData.assets || [];return all.filter(function(a){return s.affected.includes(a.id);}); }
  function sourceLines(r) {
    var d=r.storyData || {},s=state(r),out=['Rotator capture: '+(d.capturedAt || 'manual entry')+'. Engine observation: '+(d.asOf || 'not available')+'.'];
    if(s.included.includes('market') && coverage(r,'market'))out.push('Market readings: captured Rotator board; trailing 7-day price change, not a forecast. Engine '+(d.engine || 'version unavailable')+'.');
    if(s.included.includes('rates') && coverage(r,'rates'))out.push('Fed reading: '+(d.world.items.fed.date || d.world.items.fed.day || 'reading date unavailable')+'; cached at capture '+(d.worldAgeMs==null?'(age unavailable)': '('+Math.round(d.worldAgeMs/3600000)+' hours old)')+'. Source: https://www.newyorkfed.org/markets/reference-rates/effr');
    if(s.included.includes('etf') && coverage(r,'etf'))out.push('ETF net flows: latest reporting dates shown above; USD millions. Capture cache age: '+(d.etfAgeMs==null?'unavailable':Math.round(d.etfAgeMs/3600000)+' hours')+'. Source: https://farside.co.uk/');
    if(s.included.includes('unlocks') && coverage(r,'unlocks'))out.push('Unlock schedules: captured Rotator data; schedule coverage is partial and the feed timestamp is unavailable. Source: https://defillama.com/unlocks');
    if(s.included.includes('sentiment') && coverage(r,'sentiment'))out.push('Fear & Greed: '+r.fearGreed+'/100, '+(d.sentiment && (d.sentiment.date || d.sentiment.timestamp) || 'source timestamp not recorded')+'. Source: https://alternative.me/crypto/fear-and-greed-index/');
    return out;
  }
  function article(r) {
    var s=state(r),d=r.storyData || {},focus=targetAssets(r),parts=[],missing=[];
    var names=focus.map(function(a){return a.symbol;}).join(', ') || 'the selected markets';
    parts.push('Today’s Rotator Map','A reading of market leadership, liquidity and the evidence still missing.','Observation: '+r.date+' · '+r.markets.join(', '));
    parts.push('The story in one look',r.narrative || ('Today’s research starts with '+(r.regime ? 'a recorded market regime of “'+r.regime+'”' : 'a regime still to be established')+'. The question for '+names+' is whether relative leadership is supported by the broader liquidity and supply picture. These observations are a framework for investigation, not proof of a single cause.'));
    s.included.forEach(function(id){
      var note=text(s.notes[id]).trim(),available=coverage(r,id);
      if(!available && !note){missing.push(topics.find(function(t){return t.id===id;}).name);return;}
      if(id==='market') {
        parts.push('Where leadership is changing');
        var selected=focus.length?focus:(d.assets || []).slice(0,6);
        var rows=selected.filter(function(a){return number(a.p7);});
        if(rows.length)parts.push(rows.map(function(a){return a.symbol+' ('+a.market+'): '+fmt(a.p7)+'% over the trailing 7 days'+(number(a.score)?'; captured Rotator score '+fmt(a.score):'')+'.';}).join(' '));
        if(rows.length>1 && rows.every(function(a){return a.p7<0;}))parts.push('The selected assets all declined over this window. Relative resilience here means a smaller decline, not an outright gain or evidence of money moving directly between these tokens.');
        if(r.strongest)parts.push('Relative strength: '+r.strongest);
        if(r.weakest)parts.push('Relative weakness: '+r.weakest);
        if(r.changes)parts.push('What changed: '+r.changes);
        parts.push('Price leadership and the Rotator score describe different observations. A stronger trailing return does not, on its own, establish an attractive entry point.');
      }
      if(id==='rates'){
        parts.push('The cost-of-money backdrop');
        if(available)parts.push('The captured Fed reading is '+fmt(d.world.items.fed.v)+'%. This is a rate level, not evidence that a hike or cut happened today. Check the decision date and statement before describing a new policy event.');
        parts.push('This section asks whether the rates backdrop helps explain the market’s risk appetite; the captured data alone cannot establish causation.');
      }
      if(id==='unlocks'){
        parts.push('Supply deserves a separate lens');
        var ids=focus.length?focus.map(function(a){return a.id;}):Object.keys(d.unlocks || {}).slice(0,6);
        var lines=ids.map(function(id){var u=(d.unlocks || {})[id],a=(d.assets || []).find(function(x){return x.id===id;});if(!u)return '';return (a?a.symbol:id)+': next scheduled unlock '+(u.next_unlock_at || 'date unavailable')+(number(u.next_unlock_pct)?', '+fmt(u.next_unlock_pct)+'% (feed’s reported percentage)':'')+'.';}).filter(Boolean);
        parts.push(lines.length?lines.join(' '):'No unlock schedule was captured for the selected assets. Missing coverage does not mean no unlock is scheduled.');
        parts.push('A scheduled unlock is a supply event, not a forecast of selling. Allocation, recipient behavior and existing expectations still need research.');
      }
      if(id==='etf'){
        parts.push('Follow the reported flows');
        ['BTC','ETH'].forEach(function(a){var e=d.etf && d.etf[a];if(e && e.last && number(e.last.total))parts.push(a+' ETF net flow: '+fmt(e.last.total)+' million USD on '+e.last.day+(number(e.sum5)?'; last five reported trading days '+fmt(e.sum5)+' million USD':'')+'.');});
        parts.push('ETF flows cover one channel of demand. Reporting dates may precede the observation date, and flows do not explain every price move.');
      }
      if(id==='sentiment'){
        parts.push('Sentiment is context, not a trigger');
        if(available)parts.push('The recorded Fear & Greed reading is '+r.fearGreed+' out of 100. Read it beside leadership and liquidity rather than using it to time a trade.');
      }
      if(id==='news')parts.push('The news that belongs in this story');
      if(note)parts.push(note);
    });
    parts.push('What this means for '+names,'The useful next step is to compare these observations on the same time window. A macro backdrop, a flow reading and a token-specific event may coexist without one causing the others.');
    if(r.paths)parts.push('Rotation paths under study: '+r.paths+'. These are hypotheses to revisit, not instructions to exchange assets.');
    parts.push('What would change this reading?','Look for a reversal in relative leadership, revised flow reports, or new information about supply and policy. Record the competing explanation and revisit it on '+(r.returnDate || 'the next research run')+'.');
    if(missing.length)parts.push('Research still needed','No observation or editorial note was supplied for: '+missing.join(', ')+'. These sections were left out of the interpretation.');
    parts.push('Explore the evidence in Rotator','Open the Rotator research page to inspect the indicator, compare the affected assets and return for the next reading: '+(r.researchUrl || 'https://rotatortool.com/board.html#today-research'));
    parts.push('Sources & limitations',sourceLines(r).join('\n')+(r.sources?'\nAuthor’s sources and limitations:\n'+r.sources:''),'Educational market research. Observations are not direct buy or sell advice; outcomes remain uncertain.');
    return parts.join('\n\n');
  }
  function frame(title,sub,content,foot) {return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620" role="img" aria-label="'+esc(title)+'"><rect width="1000" height="620" rx="20" fill="#f4f6fa"/><text x="45" y="52" fill="#7b5b0e" font-family="Arial" font-size="17" font-weight="bold">ROTATOR / TODAY’S MAP</text><text x="45" y="96" fill="#182b43" font-family="Arial" font-size="30" font-weight="bold">'+esc(title)+'</text><text x="45" y="130" fill="#52647a" font-family="Arial" font-size="16">'+esc(sub)+'</text>'+content+'<text x="45" y="563" fill="#52647a" font-family="Arial" font-size="15">'+esc(foot)+'</text><text x="45" y="596" fill="#182b43" font-family="Arial" font-size="16" font-weight="bold">Explore the Rotator indicator → rotatortool.com</text></svg>';}
  function charts(r) {
    var s=state(r),d=r.storyData || {},out=[],focus=targetAssets(r),all=focus.length?focus:d.assets || [];
    var rows=all.filter(function(a){return number(a.p7);}).slice(0,6);
    if(s.included.includes('market') && rows.length){
      var max=Math.max.apply(null,rows.map(function(a){return Math.abs(a.p7);} )) || 1;
      var bars='<line x1="540" x2="540" y1="167" y2="475" stroke="#9ba9bc"/>';
      rows.forEach(function(a,i){var y=190+i*46,w=Math.abs(a.p7)/max*260;bars+='<text x="45" y="'+(y+18)+'" fill="#182b43" font-family="Arial" font-size="18">'+esc(a.symbol+' · '+a.market)+'</text><rect x="'+(a.p7<0?540-w:540)+'" y="'+y+'" width="'+w+'" height="27" rx="3" fill="'+(a.p7<0?'#bc5360':'#237a72')+'"/><text x="855" y="'+(y+19)+'" fill="#182b43" font-family="Arial" font-size="18">'+esc(fmt(a.p7))+'%</text>';});
      bars+='<text x="280" y="505" font-family="Arial" font-size="15" fill="#52647a">−'+fmt(max)+'%</text><text x="533" y="505" font-family="Arial" font-size="15" fill="#52647a">0</text><text x="775" y="505" font-family="Arial" font-size="15" fill="#52647a">+'+fmt(max)+'%</text>';
      out.push({id:'leadership',title:'Market leadership · trailing 7 days',svg:frame('Market leadership · trailing 7 days',r.date+' · selected captured assets; not a ranking',bars,'Source: Rotator board snapshot · '+(d.asOf || d.capturedAt || 'timestamp unavailable'))});
    }
    if(s.included.includes('etf') && coverage(r,'etf')){
      var e=d.etf.BTC && d.etf.BTC.last?d.etf.BTC:d.etf.ETH,asset=e===d.etf.BTC?'BTC':'ETH',data=(e.bars || []).filter(function(b){return number(b.total) && b.complete!==false && !b.prov;}).slice(-10);
      if(data.length>1){var hi=Math.max.apply(null,data.map(function(b){return Math.abs(b.total);}))||1,svg='<line x1="70" x2="930" y1="330" y2="330" stroke="#9ba9bc"/>';
        data.forEach(function(b,i){var h=Math.abs(b.total)/hi*145,x=90+i*(800/data.length);svg+='<rect x="'+x+'" y="'+(b.total>=0?330-h:330)+'" width="'+(560/data.length)+'" height="'+h+'" fill="'+(b.total>=0?'#237a72':'#bc5360')+'"><title>'+esc(b.day+': '+fmt(b.total)+' USD millions')+'</title></rect>';});
        svg+='<text x="60" y="177" fill="#52647a" font-family="Arial" font-size="14">+'+fmt(hi)+'m</text><text x="50" y="335" fill="#52647a" font-family="Arial" font-size="14">0</text><text x="60" y="494" fill="#52647a" font-family="Arial" font-size="14">−'+fmt(hi)+'m</text><text x="90" y="525" fill="#52647a" font-family="Arial" font-size="15">'+esc(data[0].day)+'</text><text x="790" y="525" fill="#52647a" font-family="Arial" font-size="15">'+esc(data[data.length-1].day)+'</text>';
        out.push({id:'etf',title:asset+' ETF net flows · USD millions',svg:frame(asset+' ETF net flows · USD millions','Captured reported days · inflows above zero, outflows below',svg,'Source: Farside Investors via Rotator · incomplete days excluded')});
      }
    }
    if(s.included.includes('sentiment') && coverage(r,'sentiment') && out.length<2){var v=Number(r.fearGreed);out.push({id:'sentiment',title:'Fear & Greed · '+v+'/100',svg:frame('Fear & Greed · '+v+' / 100','A sentiment snapshot; not a prediction','<rect x="80" y="270" width="840" height="54" rx="15" fill="#dce3ec"/><rect x="80" y="270" width="'+(v*8.4)+'" height="54" rx="15" fill="#a57d29"/><text x="80" y="365" fill="#52647a" font-family="Arial" font-size="19">0 · Extreme fear</text><text x="735" y="365" fill="#52647a" font-family="Arial" font-size="19">100 · Extreme greed</text>','Source: alternative.me · author-recorded value on '+r.date)});}
    return out.slice(0,s.graphCount===1?1:2);
  }
  function paragraphs(articleText) {return text(articleText).split(/\n\n/).map(function(p,i){var heading=/^(The story in one look|Where leadership is changing|The cost-of-money backdrop|Supply deserves a separate lens|Follow the reported flows|Sentiment is context, not a trigger|The news that belongs in this story|What this means for .+|What would change this reading\?|Research still needed|Explore the evidence in Rotator|Sources & limitations)$/.test(p);return i===0?'<h1>'+esc(p)+'</h1>':heading?'<h2>'+esc(p)+'</h2>':'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>';}).join('');}
  function html(r) {var url=r.researchUrl || 'https://rotatortool.com/board.html#today-research';if(!/^https?:$/.test(new URL(url).protocol))throw Error('Invalid research URL');return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Today’s Rotator Map</title><style>body{margin:0;background:#edf1f6;color:#182b43;font:18px/1.75 Georgia,serif}article{max-width:800px;margin:40px auto;padding:48px;background:white;border:1px solid #cbd5e1;border-radius:16px}h1{font:600 42px/1.15 Arial}h2{font:600 25px/1.3 Arial;margin-top:32px}svg{width:100%;height:auto;margin:20px 0}p{white-space:normal}a{color:#236f70}@media(max-width:700px){article{padding:24px;margin:12px}h1{font-size:32px}}</style><article>'+paragraphs(r.substack || article(r))+charts(r).map(function(c){return '<figure>'+c.svg+'<figcaption>'+esc(c.title)+'</figcaption></figure>';}).join('')+'<p><a href="'+esc(url)+'">Explore the full research and Rotator indicator →</a></p></article></html>';}
  var api={topics:topics,defaults:defaults,capture:capture,state:state,coverage:coverage,article:article,charts:charts,html:html,sourceLines:sourceLines,escape:esc,body:paragraphs};
  host.RotatorStory=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
