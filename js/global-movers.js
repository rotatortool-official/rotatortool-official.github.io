/* ══════════════════════════════════════════════════════════════════
   global-movers.js  —  Market Ticker feed (cross-asset)

   Reads from Supabase `unified_market_data_latest` (populated by the
   sync-market-data Edge Function every 12h). Renders top gainers +
   losers into the #mt-track inside the top-of-page Market Ticker as
   an infinite-loop TV-news-style strip (pause-on-hover via CSS).
═══════════════════════════════════════════════════════════════════ */

(function() {
  var TRACK_ID   = 'mt-track';
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

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function buildItem(row) {
    var isUp    = (row.change_24h || 0) >= 0;
    var cls     = isUp ? 'mt-up' : 'mt-dn';
    var icon    = ASSET_ICON[row.asset_type] || '·';
    var symbol  = row.symbol || '';
    var name    = row.name || symbol;
    var display = symbol.replace(/=X$/, '').replace(/\^/, '');
    var title   = escAttr(name + (row.source_name ? ' — ' + row.source_name : ''));
    return ''
      + '<span class="mt-item ' + cls + '" title="' + title + '">'
      +   '<span class="mt-ico">' + icon + '</span>'
      +   '<span class="mt-sym">' + escAttr(display) + '</span>'
      +   '<span class="mt-px">' + fmtPrice(row.price, row.asset_type) + '</span>'
      +   '<span class="mt-pct">' + fmtPct(row.change_24h) + '</span>'
      + '</span>';
  }

  function render(data) {
    var track = document.getElementById(TRACK_ID);
    if (!track) return;

    if (!data || (!data.gainers.length && !data.losers.length)) {
      track.innerHTML = '<span class="mt-empty">No market data yet — server sync pending.</span>';
      track.style.animation = 'none';
      return;
    }

    /* Gainers first, then losers, so colors alternate naturally as the
       track scrolls. Duplicate the sequence so translateX(-50%) gives
       a seamless loop. */
    var items = data.gainers.concat(data.losers);
    var html  = items.map(buildItem).join('');
    track.innerHTML = html + html;
    track.style.animation = '';
  }

  function load() {
    if (typeof supaGetTopMovers !== 'function') return;
    supaGetTopMovers(5).then(render).catch(function(e) {
      console.warn('[MarketTicker] load failed:', e && e.message);
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
