/* Rotator research workflow. Consumes snapshots; never calculates market signals. */
(function () {
  'use strict';
  var KEY = 'rot_research_runs_v1', stages = ['CONTENT', 'WEBSITE', 'DEEP RESEARCH', 'TELEGRAM', 'RETURN VISIT'];
  var fields = ['title', 'date', 'regime', 'fearGreed', 'strongest', 'weakest', 'changes', 'paths', 'sources', 'narrative', 'researchUrl', 'substack', 'telegram', 'returnDate', 'returnNotes'];
  var runs = [], selected = null, filter = 'all', dirty = false, revision = '', storageError = '';
  var root = document.getElementById('rot-research');
  if (!root) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
  function read() { try { var raw = localStorage.getItem(KEY); var data = raw ? JSON.parse(raw) : []; if (!Array.isArray(data)) throw Error('Invalid saved data'); runs = data; revision = raw || ''; } catch (e) { storageError = 'Saved research could not be read. Export any open work before changing browser storage.'; } }
  function persist() { var raw = localStorage.getItem(KEY) || ''; if (raw !== revision) throw Error('Research changed in another tab. Reload before saving to avoid overwriting it.'); var next = JSON.stringify(runs); localStorage.setItem(KEY, next); revision = next; }
  function current() { return runs.find(function (r) { return r.id === selected; }); }
  function finished(r) { return stages.every(function (s) { return r.workflow[s]; }); }
  function message(s) { document.getElementById('rr-status').textContent = s; }
  function blank() { return {id: crypto.randomUUID(), title: 'Untitled signal run', date: new Date().toISOString().slice(0, 10), markets: ['Crypto'], workflow: {}, provenance: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 0}; }
  function create(capture) {
    if (dirty && !confirm('Leave unsaved edits and start a new run?')) return;
    var r = blank(), live = window.ROTATOR_RUN;
    if (capture) {
      if (!live) return message('No engine snapshot is loaded yet. Wait for Today to load, or start a manual run.');
      r.regime = live.cycleLabel || '';
      r.fearGreed = window.fearGreed && typeof window.fearGreed.value === 'number' ? String(window.fearGreed.value) : '';
      r.provenance = JSON.parse(JSON.stringify(live));
      r.title = 'Rotator observation · ' + r.date;
      r.sources = 'Rotator engine ' + (live.engineVersion || 'unknown') + '\nSnapshot: ' + (live.asOf || 'timestamp unavailable') + '\nSource: ' + (live.source || 'browser engine') + '\nCapture contains existing engine outputs. Asset summaries remain editorial inputs.';
    }
    var before = runs.slice(); runs.unshift(r);
    try { persist(); selected = r.id; dirty = false; render(); message(capture ? 'Engine snapshot captured. Add your observations below.' : 'New run saved. Add your observations below.'); return JSON.parse(JSON.stringify(r)); } catch (e) { runs = before; message(e.message); }
  }
  function collect() {
    var r = current(); if (!r) throw Error('Select a run first.');
    var out = JSON.parse(JSON.stringify(r));
    fields.forEach(function (f) { out[f] = document.getElementById('rr-' + f).value; });
    out.markets = Array.from(root.querySelectorAll('[name="rr-market"]:checked')).map(function (e) { return e.value; });
    stages.forEach(function (s, i) { out.workflow[s] = document.getElementById('rr-step-' + i).checked; });
    validate(out); return out;
  }
  function safeUrl(s) { try { return /^https?:$/.test(new URL(s).protocol); } catch (_) { return false; } }
  function validate(r) {
    if (!r.title || !r.title.trim()) throw Error('Give this run a title.');
    if (!r.markets.length) throw Error('Select at least one market.');
    if (r.fearGreed !== '' && r.fearGreed != null && (!Number.isFinite(Number(r.fearGreed)) || Number(r.fearGreed) < 0 || Number(r.fearGreed) > 100)) throw Error('Fear & Greed must be empty or a number from 0 to 100.');
    if (r.researchUrl && !safeUrl(r.researchUrl)) throw Error('Use a full http or https research-page URL.');
  }
  function save() {
    try { var r = collect(), old = current(), i = runs.indexOf(old); r.updatedAt = new Date().toISOString(); r.revision++; runs[i] = r; try { persist(); } catch (e) { runs[i] = old; throw e; } dirty = false; render(); message('Run saved in this browser.'); window.dispatchEvent(new CustomEvent('rotator:research-saved', {detail: {id:r.id, revision:r.revision}})); return r; } catch (e) { message(e.message); return null; }
  }
  function drafts() {
    try { var r = collect(); if (!r.narrative.trim()) throw Error('Add the research narrative before creating drafts.'); if (!r.researchUrl) throw Error('Add the Rotator research-page URL so both drafts link to the same page.');
      if ((r.substack || r.telegram) && !confirm('Replace the existing content drafts with drafts from the current inputs?')) return;
      var body = 'Observation date: ' + r.date + '\nMarkets: ' + r.markets.join(', ') + '\n\nMarket regime: ' + (r.regime || 'Not recorded') + '\nFear & Greed: ' + (r.fearGreed === '' ? 'Not measured' : r.fearGreed) + '\n\nRelative strength: ' + (r.strongest || 'Not recorded') + '\nRelative weakness: ' + (r.weakest || 'Not recorded') + '\n\nChanges worth studying\n' + (r.changes || 'Not recorded') + '\n\nRotation paths to investigate\n' + (r.paths || 'Not recorded') + '\n\n' + r.narrative;
      document.getElementById('rr-substack').value = 'Today’s Rotator Map\n\n' + body + '\n\nExplore the Rotator research page: ' + r.researchUrl + '\n\nSources and limitations\n' + (r.sources || 'Sources still need review.') + '\n\nEducational market research. Relative strength describes observed behavior; it does not establish future returns.';
      document.getElementById('rr-telegram').value = 'Today’s Rotator Map · ' + r.date + '\n\n' + (r.regime || 'Regime not recorded') + ' | Fear & Greed: ' + (r.fearGreed === '' ? 'not measured' : r.fearGreed) + '\nStrength: ' + (r.strongest || 'not recorded') + '\nWeakness: ' + (r.weakest || 'not recorded') + '\nPaths under study: ' + (r.paths || 'not recorded') + '\n\n' + r.narrative + '\n\nFull research, context and limitations: ' + r.researchUrl + '\n\nEducational observations. Outcomes remain uncertain.';
      dirty = true; message('Editable drafts prepared from your inputs. Review and save; nothing has been posted.');
    } catch (e) { message(e.message); }
  }
  function packageRun(r, complete) {
    if (complete) {
      if (!finished(r)) throw Error('Finish all five workflow stages before exporting a completed package. Use Backup for unfinished work.');
      ['regime','strongest','weakest','changes','paths','narrative','sources','researchUrl','substack','telegram','returnNotes'].forEach(function (f) { if (!r[f] || !r[f].trim()) throw Error('Complete ' + f + ' before exporting.'); });
      if (!r.substack.includes('Today’s Rotator Map') || !r.substack.includes(r.researchUrl) || !r.telegram.includes(r.researchUrl)) throw Error('Both drafts must reference the same research URL, and the Substack draft must retain its title.');
    }
    return {schema:'rotator.research-package.v1', exportedAt:new Date().toISOString(), status:complete?'complete':'backup', run:JSON.parse(JSON.stringify(r))};
  }
  function download(data, name) { var url = URL.createObjectURL(new Blob([data], {type:'application/json'})), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function exportRun(complete) { var r = save(); if (!r) return; try { download(JSON.stringify(packageRun(r, complete), null, 2), 'rotator-' + r.id + (complete?'-complete':'-backup') + '.json'); message('Package exported with the snapshot, research, drafts, and workflow record.'); } catch (e) { message(e.message); } }
  function input(f, label, type, hint) { return '<label class="rr-field">' + label + (hint?'<small>'+hint+'</small>':'') + (type==='area'?'<textarea id="rr-'+f+'" rows="4"></textarea>':'<input id="rr-'+f+'" type="'+(type||'text')+'"'+(f==='fearGreed'?' min="0" max="100" step="any"':'')+'>') + '</label>'; }
  function render() {
    var r = current();
    root.innerHTML = '<div class="rr-heading"><div><span class="rr-eyebrow">ROTATOR / RESEARCH WORKSPACE</span><h2>From signal to story.</h2><p>Capture a reading. Build the context. Follow the research through.</p></div><button data-action="capture" class="rr-primary">＋ Capture current run</button></div>' +
      '<p class="rr-local">Private drafts are saved on this browser and device. Export backups to move or preserve your work. Forex observations are manual; this workspace does not introduce a forex feed.</p><div id="rr-status" role="status" aria-live="polite">'+esc(storageError)+'</div>' +
      '<div class="rr-layout"><aside class="rr-history"><div class="rr-row"><h3>Research runs <span>'+runs.length+'</span></h3><button data-action="new">＋ New</button></div><label class="rr-field">Show runs<select id="rr-filter"><option value="all">All runs</option><option value="open">Unfinished</option><option value="complete">Completed</option></select></label><div class="rr-run-list">'+runs.filter(function(x){return filter==='all'||(filter==='complete'?finished(x):!finished(x));}).map(function(x){return '<button class="rr-run '+(x.id===selected?'active':'')+'" data-run="'+esc(x.id)+'"><b>'+esc(x.title)+'</b><span>'+esc(x.date)+' · '+stages.filter(function(s){return x.workflow[s];}).length+'/5 stages</span><small>'+esc(x.regime||'Regime not recorded')+'</small></button>';}).join('')+'</div><button data-action="import">Import backup</button><input type="file" id="rr-file" accept="application/json,.json" hidden></aside><div class="rr-editor">'+
      (r?'<div class="rr-row"><h3>Signal notebook</h3><span class="rr-version">Revision '+r.revision+'</span></div><div class="rr-grid">'+input('title','Run title')+input('date','Observation date','date')+input('regime','Market regime')+input('fearGreed','Fear & Greed · 0–100','number','Leave empty when not measured.')+'</div><fieldset class="rr-markets"><legend>Market coverage</legend>'+['Crypto','Stocks','Forex'].map(function(m){return '<label><input type="checkbox" name="rr-market" value="'+m+'" '+(r.markets.includes(m)?'checked':'')+'> '+m+'</label>';}).join('')+'</fieldset><div class="rr-grid">'+input('strongest','Strongest assets','area','Include identifiers, comparison window, and market.')+input('weakest','Weakest assets','area')+input('changes','Biggest changes','area')+input('paths','Rotation paths under study','area','For example: Crypto · UNI → ONDO. Record a hypothesis, not an instruction.')+'</div>'+input('sources','Sources, timestamps & limitations','area')+input('narrative','Research narrative','area','Explain the evidence, competing explanations, and what would change your reading.')+input('researchUrl','Rotator research-page URL','url','Use an existing published Rotator page. Saving a private draft does not publish that page.')+'<div class="rr-row"><h3>Content studio</h3><button data-action="drafts">Prepare matching drafts</button></div><div class="rr-grid">'+input('substack','Substack · Today’s Rotator Map','area')+input('telegram','Telegram · same research page','area')+'</div><h3>Research workflow</h3><p class="rr-help">Mark a stage after the work is done. These controls record progress; they do not publish or send content.</p><div class="rr-workflow">'+stages.map(function(s,i){return '<label><input type="checkbox" id="rr-step-'+i+'" '+(r.workflow[s]?'checked':'')+'><span><small>0'+(i+1)+'</small>'+s+'</span></label>';}).join('')+'</div><div class="rr-grid">'+input('returnDate','Return visit date','date')+input('returnNotes','Return visit findings','area','Revisit the hypothesis and record what held up or changed.')+'</div><div class="rr-actions"><button data-action="save" class="rr-primary">Save run</button><button data-action="export">Export completed package ↗</button><button data-action="backup">Backup this run</button></div><details><summary>Captured engine provenance</summary><pre>'+esc(JSON.stringify(r.provenance,null,2)||'Manual entry')+'</pre></details>':'<div class="rr-empty"><span>◎</span><h3>Your next observation starts here.</h3><p>Capture the loaded Rotator engine output, or create a manual run.<br>Your notes, drafts, and follow-through stay together.</p><button data-action="new" class="rr-primary">Create your first run</button></div>')+'</div></div><div class="rr-compare"><div class="rr-row"><h3>Compare the research</h3><span>Historical observations, side by side</span></div><div class="rr-row"><label>Earlier run <select id="rr-left">'+options()+'</select></label><label>Later run <select id="rr-right">'+options()+'</select></label><button data-action="compare">Compare runs</button></div><div id="rr-comparison"></div></div>';
    document.getElementById('rr-filter').value = filter;
    if (r) fields.forEach(function(f){document.getElementById('rr-'+f).value = r[f] || '';});
    if (runs.length>1) document.getElementById('rr-left').selectedIndex=1;
    root.querySelectorAll('input:not([type=file]), textarea').forEach(function(e){e.addEventListener('input',function(){dirty=true;message('Unsaved edits · Save run to preserve them.');});});
    document.getElementById('rr-filter').onchange=function(e){if(dirty&&!confirm('Discard unsaved edits?'))return;filter=e.target.value;dirty=false;render();};
    document.getElementById('rr-file').onchange=importFile;
  }
  function options(){return runs.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.date+' · '+r.title)+'</option>';}).join('');}
  function compare(){var a=runs.find(function(r){return r.id===document.getElementById('rr-left').value;}), b=runs.find(function(r){return r.id===document.getElementById('rr-right').value;});if(!a||!b||a.id===b.id)return message('Choose two different saved runs.');document.getElementById('rr-comparison').innerHTML='<div class="rr-table-wrap"><table><thead><tr><th>Observation</th><th>'+esc(a.title)+'</th><th>'+esc(b.title)+'</th></tr></thead><tbody>'+['date','regime','fearGreed','strongest','weakest','changes','paths','narrative','returnNotes'].map(function(f){return '<tr><th>'+esc(f)+'</th><td>'+esc(a[f]||'Not recorded')+'</td><td>'+esc(b[f]||'Not recorded')+'</td></tr>';}).join('')+'</tbody></table></div>';}
  async function importFile(e){try{if(dirty)throw Error('Save your open edits before importing.');var file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('Backup is too large (maximum 5 MB).');var data=JSON.parse(await file.text()),r=data.run;if(data.schema!=='rotator.research-package.v1'||!r||typeof r.id!=='string'||!Array.isArray(r.markets)||!r.workflow||typeof r.workflow!=='object')throw Error('This is not a Rotator research backup.');fields.forEach(function(f){if(r[f]!=null&&typeof r[f]!=='string')throw Error('Invalid field: '+f);});validate(r);if(runs.some(function(x){return x.id===r.id;}))throw Error('This run already exists. Import will not overwrite it.');r.revision=Number.isInteger(r.revision)?r.revision:0;runs.unshift(r);try{persist();}catch(err){runs.shift();throw err;}selected=r.id;render();message('Research backup imported.');}catch(err){message(err.message);}}
  root.addEventListener('click',function(e){var button=e.target.closest('button');if(!button)return;try{if(button.dataset.run){if(dirty&&!confirm('Discard unsaved edits?'))return;selected=button.dataset.run;dirty=false;render();return;}var a=button.dataset.action;if(a==='new')create(false);if(a==='capture')create(true);if(a==='save')save();if(a==='drafts')drafts();if(a==='export')exportRun(true);if(a==='backup')exportRun(false);if(a==='compare')compare();if(a==='import')document.getElementById('rr-file').click();}catch(err){message(err.message);}});
  window.addEventListener('beforeunload',function(e){if(dirty){e.preventDefault();e.returnValue='';}});
  /* Same-page agent interface: explicit, versioned mutations. No send/publish action. */
  window.RotatorResearch = Object.freeze({version:1, createManual:function(){if(dirty)throw Error('Save open UI edits first.');return create(false);}, captureCurrent:function(){if(dirty)throw Error('Save open UI edits first.');return create(true);}, list:function(){return JSON.parse(JSON.stringify(runs));}, get:function(id){return JSON.parse(JSON.stringify(runs.find(function(r){return r.id===id;})||null));}, exportPackage:function(id){var r=runs.find(function(x){return x.id===id;});if(!r)throw Error('Run not found');return packageRun(r,true);}, update:function(id,patch,expectedRevision){if(dirty)throw Error('Save open UI edits first.');var i=runs.findIndex(function(r){return r.id===id;});if(i<0)throw Error('Run not found');var old=runs[i];if(old.revision!==expectedRevision)throw Error('Revision conflict');var r=JSON.parse(JSON.stringify(old));Object.keys(patch).forEach(function(f){if(!fields.includes(f)&&f!=='workflow')throw Error('Unsupported field: '+f);if(f==='workflow'){stages.forEach(function(s){if(s in patch.workflow){if(typeof patch.workflow[s]!=='boolean')throw Error('Workflow values must be boolean');r.workflow[s]=patch.workflow[s];}});}else{if(typeof patch[f]!=='string')throw Error('Field must be text');r[f]=patch[f];}});validate(r);r.revision++;r.updatedAt=new Date().toISOString();runs[i]=r;try{persist();}catch(e){runs[i]=old;throw e;}render();window.dispatchEvent(new CustomEvent('rotator:research-saved',{detail:{id:id,revision:r.revision}}));return JSON.parse(JSON.stringify(r));}});
  read();selected=runs[0]?runs[0].id:null;render();
})();
