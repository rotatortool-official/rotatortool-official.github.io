/* ══════════════════════════════════════════════════════════════════
   global-movers.js  —  Cross-asset "Global Top Movers" widget

   Reads from Supabase `unified_market_data_latest` (populated by the
   sync-market-data Edge Function every 12h). Shows the top gainers
   and losers across crypto + stocks + forex in one glance.
═══════════════════════════════════════════════════════════════════ */

(function() {
  var WIDGET_ID = 'global-movers';
  var REFRESH_MS = 30 * 60 * 1000; /* client-side re-poll every 30 min */

  var ASSET_ICON = {
    crypto: '◆',
    stock:  '▲',
    forex:  '⇄'
  };

  function fmtPrice(p, assetType) {
    if (p == null) return '—';
    if (assetType === 'forex') return Number(p).toFixed(4);
    if (p >= 1000) return Number(p).toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)    return Number(p).toFixed(2);
    if (p >= 0.01) return Number(p).toFixed(4);
    return Number(p).toPrecision(3);
  }

  function fmtPct(x) {
    if (x == null) return '—';
    var sign = x > 0 ? '+' : '';
    return sign + Number(x).toFixed(2) + '%';
  }

  function fmtAge(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.round(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs  = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  function buildItem(row, side) {
    var isUp   = (row.change_24h || 0) >= 0;
    var cls    = isUp ? 'gm-up' : 'gm-dn';
    var icon   = ASSET_ICON[row.asset_type] || '·';
    var symbol = row.symbol || '';
    var name   = row.name || symbol;
    /* Strip Yahoo suffixes for display */
    var display = symbol.replace(/=X$/, '').replace(/\.DE$/, '.DE').replace(/\^/, '');
    return ''
      + '<div class="gm-item ' + cls + '" title="' + name + ' — ' + row.source_name + '">'
      +   '<span class="gm-ico">' + icon + '</span>'
      +   '<span class="gm-sym">' + display + '</span>'
      +   '<span class="gm-px">' + fmtPrice(row.price, row.asset_type) + '</span>'
      +   '<span class="gm-pct">' + fmtPct(row.change_24h) + '</span>'
      + '</div>';
  }

  function render(data) {
    var root = document.getElementById(WIDGET_ID);
    if (!root) return;

    if (!data || (!data.gainers.length && !data.losers.length)) {
      root.innerHTML = ''
        + '<div class="gm-head"><span class="gm-title">🌍 GLOBAL TOP MOVERS</span>'
        +   '<span class="gm-ts">no data yet — server sync pending</span></div>';
      return;
    }

    var gainersHtml = data.gainers.map(function(r) { return buildItem(r, 'gain'); }).join('');
    var losersHtml  = data.losers.map(function(r)  { return buildItem(r, 'lose'); }).join('');

    root.innerHTML = ''
      + '<div class="gm-head">'
      +   '<span class="gm-title">🌍 GLOBAL TOP MOVERS <span class="gm-sub">crypto · stocks · forex</span></span>'
      +   '<span class="gm-ts">updated ' + fmtAge(data.updatedAt) + '</span>'
      + '</div>'
      + '<div class="gm-cols">'
      +   '<div class="gm-col gm-col-up"><div class="gm-col-title">▲ GAINERS 24H</div>' + gainersHtml + '</div>'
      +   '<div class="gm-col gm-col-dn"><div class="gm-col-title">▼ LOSERS 24H</div>'  + losersHtml  + '</div>'
      + '</div>';
  }

  function load() {
    if (typeof supaGetTopMovers !== 'function') return;
    supaGetTopMovers(5).then(render).catch(function(e) {
      console.warn('[GlobalMovers] load failed:', e && e.message);
    });
  }

  /* Public API — exposed so renderAll() or setMode() can force a refresh. */
  window.GlobalMovers = { load: load, render: render };

  /* Initial load once DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }

  /* Periodic refresh */
  setInterval(load, REFRESH_MS);
})();
