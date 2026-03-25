/* ── State ───────────────────────────────────────────────────── */
var holdings   = loadH();
var fxHoldings = loadFxH();
var stHoldings = loadStH();

/* ── Persistence Helpers ──────────────────────────────────────── */
function loadH()  { try { return JSON.parse(localStorage.getItem('rot_h5') || '[]'); } catch(e) { return []; } }
function saveH()  { try { localStorage.setItem('rot_h5', JSON.stringify(holdings)); } catch(e) {} }
function loadFxH() { try { return JSON.parse(localStorage.getItem('rot_fx_h') || '[]'); } catch(e) { return []; } }
function saveFxH() { try { localStorage.setItem('rot_fx_h', JSON.stringify(fxHoldings)); } catch(e) {} }
function loadStH() { try { return JSON.parse(localStorage.getItem('rot_st_h') || '[]'); } catch(e) { return []; } }
function saveStH() { try { localStorage.setItem('rot_st_h', JSON.stringify(stHoldings)); } catch(e) {} }

/* ── Crypto Holdings Render ───────────────────────────────────── */
function renderTiles() {
  var container = document.getElementById('h-tiles');
  if (!container) return;

  if (!holdings.length) {
    container.innerHTML = '<div class="empty">No holdings added yet.</div>';
    renderSignal([]); // Clear signal if empty
    return;
  }

  var heldCoins = [];
  var html = holdings.map(function(h) {
    var c = coins.find(function(x) { return x.id === h.id; }) || {};
    if (c.id) heldCoins.push(c);
    
    var price = c.current_price || 0;
    var score = c.score || 50;
    var glw = score >= 62 ? 'glow-up' : (score <= 38 ? 'glow-dn' : '');

    return '<div class="tile ' + glw + '" onclick="openCoinDetails(\'' + h.id + '\')">' +
      '<div class="tile-top">' +
        '<span class="tile-sym">' + h.sym + '</span>' +
        '<button class="tile-rm" onclick="event.stopPropagation(); removeHolding(\'' + h.id + '\')">×</button>' +
      '</div>' +
      '<div class="tile-price">' + (price ? '$' + formatPrice(price) : '—') + '</div>' +
      '<div class="tile-perfs">' +
        '<div class="tpf"><span class="tpf-l">SCORE</span><span class="tpf-v">' + score + '</span></div>' +
      '</div>' +
    '</div>';
  }).join('');

  container.innerHTML = html;
  renderSignal(heldCoins);
}

/* ── Add/Remove Logic ────────────────────────────────────────── */
function addHolding() {
  var sel = document.getElementById('coin-sel');
  if (!sel || !sel.value) return;
  var id = sel.value;
  var coin = coins.find(function(c){ return c.id === id; });
  if (!coin) return;

  if (holdings.find(function(h){ return h.id === id; })) return;
  holdings.push({ id: id, sym: coin.symbol.toUpperCase() });
  saveH();
  renderTiles();
  renderCoinSel();
}

function removeHolding(id) {
  holdings = holdings.filter(function(h) { return h.id !== id; });
  saveH();
  renderTiles();
  renderCoinSel();
}

/* Helper for price formatting */
function formatPrice(p) {
  if (p >= 1) return p.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  return p.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:6});
}

// Initial render
document.addEventListener('DOMContentLoaded', function() {
  renderTiles();
});