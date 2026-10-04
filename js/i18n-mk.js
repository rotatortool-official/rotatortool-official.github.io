/* ══════════════════════════════════════════════════════════════════
   i18n-mk.js — the whole page in Macedonian (promptove/73)

   HOW IT WORKS
   i18n.js already carries the long, hand-structured texts (FAQ, the two
   tours, donate, ETF). Everything else on the page is English written
   into index.html or assembled by the scripts, often with numbers in it.
   Rather than thread a translation call through several thousand lines,
   this layer translates what is ON THE PAGE:

     • MK_TEXT      exact English string → Macedonian (whitespace folded)
     • MK_PATTERNS  English templates with numbers → Macedonian
     • compound strings are split on " · " and " | " and each part is
       translated on its own, so "A · B · C" needs only A, B and C
     • a leading marker (▲ ▼ ⚠ ✓ − ⚡ 🔔 …) is kept and the rest translated

   It walks text nodes and the title / placeholder / aria-label
   attributes, and a MutationObserver translates whatever the scripts
   draw later (coin window, lists, alerts). Each translated node keeps
   its English, so switching back to English restores it exactly.
   Nothing is translated while English is selected, and the observer only
   runs in Macedonian.

   NOT TRANSLATED: coin, token and company names; tickers; numbers; the
   Terms of Service and Privacy Policy (their English is out of date:
   see promptove/73 before translating them).

   FINDING GAPS: in Macedonian, every English string the layer could not
   translate is collected in window.__mkMissing (a Set). Open the console
   and run  [...__mkMissing].join('\n')  to see what is left.

   Vocabulary follows copy/glossary-mk.md (монета, резултат, отклучување,
   отстранување од листата, известувања). Daniel reviews all of it.
══════════════════════════════════════════════════════════════════ */

var MK_TEXT = {};        /* filled below, section by section */
var MK_PATTERNS = [];    /* [RegExp, function(match) → string] */
var MK_BLOCKS = {};      /* CSS selector → Macedonian innerHTML, for legal prose (js/i18n-mk-legal.js) */

(function () {
  var ON = false, observer = null, busy = false;
  var tracked = [];                      /* text nodes we changed */
  var trackedAttr = [];                  /* [element, attr] pairs we changed */
  var ATTRS = ['title', 'placeholder', 'aria-label'];
  /* Any leading run of symbols or emoji (▲ ⚠ 🟢 ◆ + …) is kept as is and the rest
     translated, so "🟢 Wins — Beat the market" needs only its words. */
  var MARK = /^([^\p{L}\p{N}"'(“„#$]+)(.+)$/u;
  window.__mkMissing = new Set();

  function fold(s) { return s.replace(/\s+/g, ' ').trim(); }

  function translate(core, depth) {
    if (!core || !/[A-Za-z]{2,}/.test(core)) return null;
    if (Object.prototype.hasOwnProperty.call(MK_TEXT, core)) return MK_TEXT[core];
    for (var i = 0; i < MK_PATTERNS.length; i++) {
      var m = MK_PATTERNS[i][0].exec(core);
      if (m) return MK_PATTERNS[i][1](m);
    }
    depth = depth || 0;
    if (depth < 3) {
      var mm = MARK.exec(core);
      if (mm && mm[2] && mm[1].trim()) {
        var rest = translate(mm[2], depth + 1);
        if (rest != null) return mm[1] + rest;
      }
      var seps = [' | ', ' · ', ', '];
      for (var k = 0; k < seps.length; k++) {
        if (core.indexOf(seps[k]) > 0) {
          var parts = core.split(seps[k]), any = false, all = true;
          var out = parts.map(function (p) {
            var t = translate(p.trim(), depth + 1);
            if (t != null) { any = true; return t; }
            all = false; return p.trim();
          });
          /* " · " and " | " join labels, so a proper noun left in English
             among them is fine. ", " can be a sentence: all or nothing. */
          if (seps[k] === ', ' ? all : any) return out.join(seps[k]);
        }
      }
    }
    return null;
  }
  window.mkTranslate = function (s) { var c = fold(String(s || '')); var t = translate(c); return t == null ? s : t; };

  function skip(el) {
    return !el || el.closest('script,style,svg,textarea,[data-no-i18n],#tos-modal,#privacy-modal,#faq-modal,.tut-card');
  }

  function doText(n) {
    var raw = n.nodeValue;
    if (!raw || !/[A-Za-z]{2,}/.test(raw)) return;
    if (n.__mk !== undefined && raw === n.__mk) return;          /* ours already */
    var lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    var core = fold(raw);
    var t = translate(core);
    if (t == null) { if (/[A-Za-z]{3,}/.test(core) && core.length < 400) window.__mkMissing.add(core); return; }
    n.__en = raw; n.__mk = lead + t + trail;
    busy = true; n.nodeValue = n.__mk; busy = false;
    tracked.push(n);
  }

  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var v = el.getAttribute(a);
      el.__mkA = el.__mkA || {};
      if (el.__mkA[a] && el.__mkA[a].mk === v) continue;
      var t = translate(fold(v));
      if (t == null) continue;
      el.__mkA[a] = { en: v, mk: t };
      busy = true; el.setAttribute(a, t); busy = false;
      trackedAttr.push([el, a]);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skip(root.parentElement)) doText(root); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }

  function start() {
    walk(document.body);
    if (!observer) {
      observer = new MutationObserver(function (list) {
        if (busy || !ON) return;
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (r.type === 'childList') { for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]); }
          else if (r.type === 'characterData') { if (!skip(r.target.parentElement)) doText(r.target); }
          else if (r.type === 'attributes' && ATTRS.indexOf(r.attributeName) >= 0 && !skip(r.target)) doAttrs(r.target);
        }
      });
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function stop() {
    if (observer) observer.disconnect();
    busy = true;
    tracked.forEach(function (n) { if (n.__en !== undefined && n.nodeValue === n.__mk) n.nodeValue = n.__en; delete n.__mk; });
    trackedAttr.forEach(function (p) {
      var el = p[0], a = p[1], rec = el.__mkA && el.__mkA[a];
      if (rec && el.getAttribute(a) === rec.mk) el.setAttribute(a, rec.en);
      if (el.__mkA) delete el.__mkA[a];
    });
    busy = false;
    tracked = []; trackedAttr = [];
  }

  /* Whole blocks: the Terms and the Privacy Policy are legal prose broken up
     by bold words and links, so they are swapped as complete Macedonian
     HTML instead of translated phrase by phrase. The English HTML is kept
     on the element and put back when English is chosen. */
  function blocks(on) {
    Object.keys(MK_BLOCKS).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) { if (el.__enHTML === undefined) el.__enHTML = el.innerHTML; el.innerHTML = MK_BLOCKS[sel]; }
      else if (el.__enHTML !== undefined) { el.innerHTML = el.__enHTML; }
    });
  }

  var TITLE_EN = document.title;
  window.applyMkLayer = function (lang) {
    var want = lang === 'mk';
    if (want === ON) { if (want) walk(document.body); return; }
    ON = want;
    blocks(want);
    if (want) { start(); var tt = translate(fold(TITLE_EN)); if (tt != null) document.title = tt; }
    else { stop(); document.title = TITLE_EN; }
  };
})();
