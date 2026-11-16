const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/calm-tabs.js');
const coins=Array.from({length:20},(_,i)=>({id:'c'+i,sym:'C'+i,p7:-29+i*2,p24:-5+i/2}));   // median -10
coins.push({id:'bitcoin',sym:'BTC',p7:-12.9,p24:0.2});
const txt=r=>r.k+' '+r.s.map(x=>x[0]).join('');
const all=B=>B.groups.flatMap(g=>g.rows.map(txt)).join(' | ');

test('today: the Today answer, then market, coins, world and your coins',()=>{
  const B=C.build('today',{coins,ma200:72943,btcPrice:65112,fg:{value:10,label:'Extreme Fear'},
    movers:{up:[{sym:'HUMA',p24:48.1},{sym:'ICP',p24:13.9}],dn:[{sym:'ZIL',p24:-18.1}]},turns:{up:43,down:8},
    liq:{long:54e6,short:46e6,hours:24},world:{ndx:{c7:-2.2},gold:{c7:-6.17},dxy:{c7:1.9}},mine:['c19','c0']});
  assert.match(B.sum,/^Falling\. /); assert.equal(B.sumTone,'dn');
  assert.deepEqual(B.groups.map(g=>g.t),['The market','Coins in the last 24 hours','The world behind it','Your coins']);
  const s=all(B);
  assert.match(s,/Bitcoin −12\.9% this week, below its 200-day average/);
  assert.match(s,/Mood Fear & Greed 10, extreme fear/);
  assert.match(s,/HUMA \+48\.1%, ICP \+13\.9% · weakest ZIL −18\.1%/);
  assert.match(s,/Forced out \$100M on Binance futures in 24 hours, 54% of it bets on a rise/);
  assert.match(s,/This week Nasdaq −2\.2%, gold −6\.2%, dollar \+1\.9%/);
  assert.match(s,/2 coins 1 of 2 did better than the market, 1 worse/);
  assert.ok(!/undefined|NaN|null/.test(s),s);});
test('today: a reading that has not loaded is left out, not guessed',()=>{
  const B=C.build('today',{coins:[]});
  assert.equal(B.sum,'The numbers are loading.');
  assert.deepEqual(B.groups.map(g=>g.t),['The world behind it']);});
test('rows open a piece on this tab or name the tab they go to',()=>{
  const B=C.build('today',{coins,turns:{up:1,down:2}});
  for(const g of B.groups)for(const r of g.rows)assert.ok(r.step||(r.go&&r.go.length===3),r.k);});
test('money flows: in and out by sign, the run, Bitcoin vs the rest, unlocks',()=>{
  const now=Date.parse('2026-11-16T12:00:00Z');
  const B=C.build('flows',{coins:coins.concat([{id:'plasma',sym:'XPL',p7:1}]),now,
    etf:{BTC:{last:{total:-185},sum5:-1065.3,streak:{dir:-1,len:7}},ETH:{last:{total:2},sum5:120,streak:{dir:1,len:1}}},
    cf:{chains:[{chain:'Aptos',d7:99e6,p7:14},{chain:'Arbitrum',d7:302e6,p7:8.3},{chain:'XRPL',d7:-124e6,p7:-12.9},{chain:'BSC',d7:-457e6,p7:-3.2},{chain:'Tron',d7:0,p7:0}]},
    cap:{r7:{beat:104,n:243,share:0.43},r30:{beat:47,n:243,share:0.19}},
    unlocks:{plasma:{next_unlock_at:'2026-11-26T00:00:00Z',next_unlock_pct:4.8},c3:{next_unlock_at:'2027-02-01T00:00:00Z',next_unlock_pct:9}}});
  assert.deepEqual(B.groups.map(g=>g.t),['Coming in','Going out','Bitcoin and the rest','Supply ahead']);
  assert.deepEqual(B.groups[0].rows.map(r=>r.k),['Ether funds','Stablecoins arriving']);
  assert.deepEqual(B.groups[1].rows.map(r=>r.k),['Bitcoin funds','Stablecoins leaving']);
  const s=all(B);
  assert.match(s,/Bitcoin funds −\$1\.07B in 5 trading days, 7 days out in a row/);
  assert.match(s,/Stablecoins arriving \+\$401M on 2 chains, most Aptos \+14\.0%/);
  assert.match(s,/Bitcoin held money better than the other coins\. 104 of 243 coins beat it this week, 47 this month\./);
  assert.match(s,/Token unlocks 1 coin in the next 30 days\. Biggest: XPL 4\.8% of its supply on 26 Nov\./);
  assert.equal(B.sum,'More money left than came in. US Bitcoin and Ether funds lost $945M in 5 trading days, and stablecoins on the 5 chains we follow fell $180M this week.');});
test('money flows: no forecast words, and loading says so',()=>{
  assert.equal(C.build('flows',{}).sum,'The numbers are loading.');
  const B=C.build('flows',{etf:{BTC:{last:{total:5},sum5:500,streak:{dir:1,len:4}}},cf:{chains:[1,2,3,4,5].map(i=>({chain:'K'+i,d7:i*1e6,p7:i}))}});
  assert.match(B.sum,/^More money came in than left\. /);
  assert.ok(!/\b(buy|sell|will|should)\b/i.test(B.sum+all(B)),B.sum);});
test('coins: turning, strongest and weakest from the tiles, the analyser, every coin',()=>{
  const cs=coins.map((c,i)=>({...c,score:30+i*2,p30:-40+i}));
  const B=C.build('coins',{coins:cs,turns:{up:['PUMP','SEI','DASH','HYPE'],down:['TRX']},mom:['c19','c18','gone','c17'],worst:['c0','c1']});
  assert.deepEqual(B.groups.map(g=>g.t),['Coins that may be turning','Strongest and weakest','One coin against the rest','Every coin']);
  const s=all(B);
  assert.match(s,/Turn-up signs 4 coins that lagged, such as PUMP, SEI and DASH/);
  assert.match(s,/Cooling signs 1 coin that ran ahead, such as TRX/);
  assert.match(s,/Highest scores C19 68, C18 66, C17 64/);   // an id the page no longer has is skipped
  assert.match(s,/Worst 30 days C0 −40\.0%, C1 −39\.0%/);
  assert.match(s,/All coins 21 coins ranked by the Rotator score, highest BTC 70/);
  assert.ok(!/undefined|NaN|null/.test(s),s);
  for(const g of B.groups)for(const r of g.rows)assert.ok(['turns','hot','strength','all','record'].includes(r.step),r.k);});
test('coins: before the scan lands, no turning rows and no guessed names',()=>{
  const B=C.build('coins',{coins:[]});
  assert.equal(B.sum,'The numbers are loading.');
  assert.deepEqual(B.groups.map(g=>g.t),['One coin against the rest','Every coin']);});
