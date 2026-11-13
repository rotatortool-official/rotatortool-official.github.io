const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../js/research-coin.js');
const others=Array.from({length:9},(_,i)=>({sym:'C'+i,p7:-20+i*5,p30:-30+i*5,score:40}));
function data(over){
  const c=Object.assign({id:'solana',sym:'SOL',name:'Solana',price:78.38,p24:-5.4,p7:-12.6,p30:-27.3,score:27,circulating_supply:591e6,total_supply:637e6,max_supply:null,
    _positioning:{longShort:3.51,funding:0.01,oiChange24h:-5.3,oiValue:758e6,takerBuySell:0.79}},over&&over.c);
  const btc={id:'bitcoin',sym:'BTC',name:'Bitcoin',price:70000,p7:-9.6,p30:-18,score:54};
  return Object.assign({c,coins:[c,btc].concat(others),tech:{rsiD:20,rsiW:48,cross:'golden',crossDays:null},techAll:{SOL:{rsiD:20},BTC:{rsiD:26}},
    unlock:{unlock30d_pct:0.3,next_unlock_at:'2026-11-15T00:00:00+00:00',next_unlock_pct:0.01},events:[],etf:null,tileNews:{us2y:{news:[{d:'2026-11-13T01:00:00Z',t:'Yields jump',u:'https://example.com/a',src:'Reuters'}]}},
    story:null,asOf:Date.parse('2026-11-13T05:00:00Z')},over,{c});
}
test('the chosen coin is the subject of every story it has data for',()=>{const d=data(),types=R.available(d);
  assert.deepEqual(types,['week','momentum','crowd','supply','news']);
  for(const t of types){const s=R.build(t,d);assert.ok(s.head.startsWith('SOL: '),t+' head: '+s.head);assert.ok(!/^BTC|Bitcoin holds/.test(s.head));
    assert.ok(s.points.length>=1 && s.points.length<=3);assert.equal(s.spec.head,s.head);assert.match(s.text,/What happened, not a forecast\. SOL on Rotator → https:\/\/rotatortool\.com\/\?coin=SOL$/);
    assert.ok(!/undefined|NaN|null/.test(JSON.stringify([s.head,s.points,s.change,s.table,s.spec.stats])),t);}});
test('no story uses buy, sell or forecast words',()=>{const d=data({events:[{event_type:'rsi_oversold',event_date:'2026-11-12'}]});
  for(const t of R.available(d)){const s=R.build(t,d),all=JSON.stringify([s.head,s.points,s.change]).toLowerCase();
    assert.ok(!/\b(buy now|sell now|should buy|should sell|will rise|will fall|bullish|bearish|guarantee)/.test(all),t+': '+all);}});
test('a story the coin has no data for is not offered and not built',()=>{const d=data({tech:null,unlock:null,c:{_positioning:null,circulating_supply:null,total_supply:null}});
  assert.deepEqual(R.available(d),['week','news']);assert.equal(R.build('crowd',d),null);assert.equal(R.build('flows',d),null);assert.equal(R.build('nope',d),null);});
test('week table sets the coin beside Bitcoin and the median coin',()=>{const s=R.build('week',data());
  assert.deepEqual(s.table.rows.map(r=>r[0]),['SOL','Bitcoin','Average coin']);assert.equal(s.table.rows[0][1],'−13%');assert.equal(s.spec.kind,'bars');
  const withHist=data({closes:Array.from({length:30},(_,i)=>({t:Date.parse('2026-10-14')+i*864e5,r:100-i}))});assert.equal(R.build('week',withHist).spec.kind,'line');});
test('Bitcoin supply is never described as an unlock',()=>{const d=data({c:{id:'bitcoin',sym:'BTC',name:'Bitcoin',circulating_supply:19.9e6,max_supply:21e6,total_supply:19.9e6}});
  const s=R.build('supply',d),all=JSON.stringify(s);assert.ok(!/unlock/i.test(JSON.stringify([s.head,s.points,s.table])),all);assert.match(s.points.join(' '),/mining/);});
test('a missing unlock calendar is said, not read as no unlock',()=>{const s=R.build('supply',data({unlock:null}));assert.match(s.points.join(' '),/does not mean none is coming/);});
test('ETF story only for a coin with flow bars, with the run and the sign kept',()=>{const etf={bars:[{day:'2026-11-07',total:-100},{day:'2026-11-10',total:-250.5},{day:'2026-11-11',total:-299.8}],last:{day:'2026-11-11',total:-299.8},sum5:-1437.9,streak:{dir:-1,len:5}};
  const d=data({c:{id:'bitcoin',sym:'BTC',name:'Bitcoin'},etf});assert.ok(R.available(d).includes('flows'));const s=R.build('flows',d);
  assert.equal(s.head,'Bitcoin ETFs: 5 trading days of outflows in a row');assert.equal(s.spec.tag,'−$300M');assert.match(s.points[2],/−\$1\.44B/);assert.equal(s.change,'One day of inflows ends the run.');});
test('news keeps the publisher and link and says headlines are background',()=>{const s=R.build('news',data({events:[{event_type:'golden_cross',event_date:'2026-11-12'}]}));
  assert.match(s.points[0],/^12 Nov: Golden cross/);assert.deepEqual(s.table.rows[0][2],{t:'Yields jump',u:'https://example.com/a'});assert.equal(s.table.rows[0][1],'Reuters');assert.match(s.table.foot,/not given as the reason SOL moved/);});
