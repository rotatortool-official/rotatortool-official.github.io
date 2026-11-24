/* PALETTE LAB (local trial, 2026-11-24) - ?pal=green | barber | off, remembered per tab.
   Remove with palette-lab.css before pushing. */
(function(){
  try{
    var q = new URLSearchParams(location.search).get('pal');
    if (q) sessionStorage.setItem('rot_pal', q);
    var p = sessionStorage.getItem('rot_pal') || 'green';
    document.documentElement.setAttribute('data-pal', p);
    document.documentElement.setAttribute('data-pal-page', /board\.html/.test(location.pathname) ? 'board' : 'landing');
  }catch(e){}
})();
/* Lab helper: share of screen area that is light / dark / accent (by background). */
window.__palMeasure = function(){
  var cs = getComputedStyle(document.documentElement);
  function rgb(s){ s=(s||'').trim(); if(s[0]!=='#') return null; var n=parseInt(s.slice(1),16); return [n>>16&255,n>>8&255,n&255]; }
  function eff(e){ while(e && e.nodeType===1){ var m=getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if(m && (m[3]===undefined || +m[3]>0.5)) return m.slice(0,3).map(Number); e=e.parentElement; } return [255,255,255]; }
  var A=rgb(cs.getPropertyValue('--pl-acc')), c={light:0,dark:0,accent:0,mid:0};
  for(var y=4;y<innerHeight;y+=8) for(var x=4;x<innerWidth;x+=8){
    var e=document.elementFromPoint(x,y); if(!e) continue; var k=eff(e), l=k[0]*.3+k[1]*.59+k[2]*.11;
    if(A && Math.hypot(k[0]-A[0],k[1]-A[1],k[2]-A[2])<60) c.accent++; else if(l<90) c.dark++; else if(l>170) c.light++; else c.mid++;
  }
  var t=c.light+c.dark+c.accent+c.mid, o={}; for(var q in c) o[q]=(100*c[q]/t).toFixed(1)+'%'; return o;
};
