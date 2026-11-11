const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  let stored = '', blocked = false;
  const els = new Map();
  const el = id => { if (!els.has(id)) els.set(id, {value:'',textContent:'',checked:false,addEventListener(){}}); return els.get(id); };
  const root = {innerHTML:'',addEventListener(type,fn){if(type==='click')this.clickHandler=fn;},querySelectorAll(selector){return selector==='[name="rr-market"]:checked'?[{value:'Crypto'}]:[];}};
  const window = {addEventListener(){},dispatchEvent(){},ROTATOR_RUN:{engineVersion:'test',asOf:'2026-11-11T12:00:00Z',cycleLabel:'test regime'},fearGreed:{value:0}};
  const storage = {getItem(){return stored||null;},setItem(k,v){if(blocked)throw Error('quota');stored=v;}};
  let n=0;
  const context = {window,document:{getElementById(id){return id==='rot-research'?root:el(id);}},localStorage:storage,crypto:{randomUUID(){return 'test-'+(++n);}},URL,Date,console,CustomEvent:class{},confirm(){return true;}};
  vm.runInNewContext(fs.readFileSync('js/research-story.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('js/research-workflow.js','utf8'),context);
  return {api:window.RotatorResearch,window,el,storage,click(action){root.clickHandler({target:{closest(){return {dataset:{action}};}}});},block(){blocked=true;},setRaw(v){stored=v;}};
}
test('manual run, defensive reads, revision conflicts, and rejected URLs',()=>{
  const {api}=setup(); const r=api.createManual(); assert.equal(r.revision,0);
  const updated=api.update(r.id,{title:'Research',fearGreed:'0'},0); assert.equal(updated.revision,1);
  const copy=api.get(r.id);copy.title='mutated';assert.equal(api.get(r.id).title,'Research');
  assert.throws(()=>api.update(r.id,{title:'stale'},0),/Revision conflict/);
  assert.throws(()=>api.update(r.id,{researchUrl:'javascript:alert(1)'},1),/http or https/);
  assert.throws(()=>api.update(r.id,{fearGreed:'101'},1),/0 to 100/);
  assert.equal(api.get(r.id).revision,1);
});
test('snapshot is immutable and missing sentiment stays unknown',()=>{
  const {api,window}=setup();const r=api.captureCurrent();assert.equal(r.fearGreed,'0');
  window.ROTATOR_RUN.cycleLabel='later';assert.equal(api.get(r.id).provenance.cycleLabel,'test regime');
  window.fearGreed=null;assert.equal(api.captureCurrent().fearGreed,'');
});
test('failed storage and competing tab writes never overwrite a saved run',()=>{
  const a=setup(),r=a.api.createManual();a.block();assert.throws(()=>a.api.update(r.id,{title:'lost'},0),/quota/);assert.equal(a.api.get(r.id).revision,0);
  const b=setup(),s=b.api.createManual();b.setRaw('[{"external":true}]');assert.throws(()=>b.api.update(s.id,{title:'overwrite'},0),/another tab/);assert.equal(b.api.get(s.id).revision,0);
});
test('completed package validates stages, required content, title and shared URL',()=>{
  const {api}=setup(),r=api.createManual();assert.throws(()=>api.exportPackage(r.id),/five workflow/);
  const url='https://rotatortool.com/crypto-capital-rotation.html';
  const patch={regime:'Mixed',strongest:'ONDO',weakest:'UNI',changes:'Leadership',paths:'UNI → ONDO',narrative:'Uncertain hypothesis',sources:'Manual',researchUrl:url,substack:'Today’s Rotator Map '+url,telegram:'Research '+url,returnNotes:'Revisited',workflow:Object.fromEntries(['CONTENT','WEBSITE','DEEP RESEARCH','TELEGRAM','RETURN VISIT'].map(s=>[s,true]))};
  api.update(r.id,patch,0);api.buildArticle(r.id,1);assert.equal(api.exportPackage(r.id).status,'complete');
  api.update(r.id,{telegram:'Missing link'},2);assert.throws(()=>api.exportPackage(r.id),/same research URL/);
});

test('UI save, stale preview guard and inline rebuild confirmation use the same persisted draft',()=>{
  const x=setup(),r=x.api.captureCurrent();
  ['market','rates','unlocks','etf','sentiment','news'].forEach(t=>{x.el('rr-topic-'+t).checked=true;});
  x.el('rr-affected').selectedOptions=[];x.el('rr-graph-count').value='2';
  x.click('save');let saved=x.api.get(r.id);assert.equal(saved.revision,1);assert.doesNotThrow(()=>x.window.RotatorStory.assertFresh(saved));
  x.el('rr-note-rates').value='A revised interpretation';x.click('preview');assert.match(x.el('rr-status').textContent,/Story inputs changed/);
  x.click('drafts');assert.match(x.el('rr-status').innerHTML,/Rebuild drafts/);
  x.click('confirm-drafts');x.click('save');saved=x.api.get(r.id);assert.equal(saved.revision,2);assert.match(saved.substack,/A revised interpretation/);assert.doesNotThrow(()=>x.window.RotatorStory.assertFresh(saved));
});
