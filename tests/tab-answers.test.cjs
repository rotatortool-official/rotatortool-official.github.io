const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../js/tab-answers.js');
const coins=Array.from({length:20},(_,i)=>({id:'c'+i,sym:'C'+i,p7:-19+i*2}));   // -19 .. +19, median 0
test('every tab gets a question, an answer and a place to go',()=>{const A=T.answers({coins});
  assert.deepEqual(Object.keys(A).sort(),['coins','deriv','flows','mine','research','today']);
  for(const k in A){assert.ok(A[k].q.endsWith('?'));assert.ok(A[k].a.length>10);assert.ok(A[k].go && A[k].k);assert.ok(!/undefined|NaN|null/.test(A[k].a),k+': '+A[k].a);}});
test('today reads the market from the coins',()=>{
  const down=T.answers({coins:coins.map(c=>({...c,p7:c.p7-10})),fearGreed:{value:20,label:'Extreme Fear'}}).today.a;
  assert.equal(down,'Falling. 5 of 20 coins are up this week; the average coin is −10%.');
  assert.match(T.answers({coins:coins.map(c=>({...c,p7:c.p7+10}))}).today.a,/^Rising\. /);assert.match(T.answers({coins}).today.a,/^Flat\. /);});
test('a number that has not loaded is never guessed',()=>{const A=T.answers({coins:[]});
  for(const k of ['today','flows','coins','deriv'])assert.equal(A[k].a,'The numbers are loading.');});
test('money flows names the run and keeps the sign',()=>{
  const out=T.answers({coins,etf:{last:{total:-299.8},sum5:-1437.9,streak:{dir:-1,len:5}}}).flows.a;
  assert.equal(out,'Out of Bitcoin funds: 5 trading days of outflows in a row (−$1.44B in 5 days).');
  assert.equal(T.answers({coins,etf:{last:{total:120},sum5:300,streak:{dir:1,len:1}}}).flows.a,'Bitcoin funds: +$120M on the latest day, +$300M over 5 days.');});
test('coins names the best and the weakest of the week',()=>{assert.equal(T.answers({coins}).coins.a,'Best this week: C19 +19%. Weakest: C0 −19%.');});
test('derivatives says how much was closed and on which side',()=>{
  assert.equal(T.answers({coins,liq:{long:361.2e6,short:25.1e6,hours:24}}).deriv.a,'$386M of futures bets were closed by force in 24 hours, 94% of them bets on a rise.');
  assert.match(T.answers({coins,liq:{long:1e6,short:9e6,hours:1}}).deriv.a,/in 1 hour, 90% of them bets on a fall\.$/);});
test('my holdings counts the reader\'s coins by id or symbol, or invites the first one',()=>{
  assert.equal(T.answers({coins,mine:[]}).mine.go,'Add a coin');
  assert.equal(T.answers({coins,mine:['c0','C19','c12']}).mine.a,'You follow 3 coins: 2 up, 1 down this week.');});
test('Macedonian uses the plain words and no forecast words',()=>{const A=T.answers({coins:coins.map(c=>({...c,p7:c.p7-10})),mk:true,fearGreed:{value:20,label:'Extreme Fear'}});
  assert.match(A.today.a,/^Во опаѓање\. 5 од 20 монети се во пораст оваа недела; просечната монета е −10%\.$/);
  assert.ok(!/биковск|мечкин/.test(JSON.stringify(A)));});
