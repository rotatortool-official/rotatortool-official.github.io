/* ══════════════════════════════════════════════════════════════════
   signal-history.js — "Told You So" Signal Track Record

   FEATURES:
   • Takes a daily snapshot of top rotation signals (top 10 bullish + top 10 lagging)
   • Stores up to 30 days of history in localStorage (~5kb/day)
   • After 7 and 14 days, compares price performance
   • Shows a "Signal Track Record" section with proven correct calls
   • Generates shareable "Told You So" cards via canvas

   DEPENDS ON: coins array, shareAsImage patterns, data-loaders.js
══════════════════════════════════════════════════════════════════ */

var SignalHistory = (function() {

  var LS_KEY = 'rot_signal_history';
  var MAX_DAYS = 30;

  /* ── Load / Save ── */
  function loadHistory() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveHistory(hist) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(hist));
    } catch(e) { /* quota exceeded — trim older entries */
      hist = hist.slice(-15);
      try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch(e2) {}
    }
  }

  /* ── Get today's date key (YYYY-MM-DD) ── */
  function dateKey(d) {
    var dt = d || new Date();
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  }

  /* ── Determine signal label for a coin ── */
  function getSignalLabel(c) {
    if (c.score >= 70) return 'STRONG MOM';
    if (c.score >= 55) return 'MOMENTUM';
    if (c.score <= 30) return 'LAGGING';
    return 'NEUTRAL';
  }

  function getExtraSignals(c) {
    var extras = [];
    if (c.p24 >= 3)   extras.push('24H SURGE');
    if (c.p24 <= -3)  extras.push('24H DIP');
    if (c.p7 >= 10)   extras.push('7D BREAKOUT');
    if (c.p7 <= -10)  extras.push('7D BREAKDOWN');
    if (c.p30 >= 20)  extras.push('30D UPTREND');
    if (c.p30 <= -20) extras.push('30D DOWNTREND');
    return extras;
  }

  /* ── Take daily snapshot ── */
  function takeSnapshot() {
    if (typeof coins === 'undefined' || !Array.isArray(coins) || coins.length < 10) return;

    var today = dateKey();
    var hist = loadHistory();

    /* Don't snapshot twice on the same day */
    if (hist.length && hist[hist.length - 1].date === today) return;

    /* Sort by score — top 10 bullish, top 10 lagging */
    var sorted = coins.filter(function(c) { return c.score != null && !c.isStable; })
                      .sort(function(a, b) { return b.score - a.score; });

    var topBull = sorted.slice(0, 10).map(function(c) {
      return {
        id: c.id, sym: c.sym, name: c.name || '',
        price: c.price, score: c.score,
        signal: getSignalLabel(c),
        extras: getExtraSignals(c),
        p24: Math.round(c.p24 * 100) / 100,
        p7: Math.round(c.p7 * 100) / 100,
        p30: Math.round(c.p30 * 100) / 100
      };
    });

    var topLag = sorted.slice(-10).reverse().map(function(c) {
      return {
        id: c.id, sym: c.sym, name: c.name || '',
        price: c.price, score: c.score,
        signal: getSignalLabel(c),
        extras: getExtraSignals(c),
        p24: Math.round(c.p24 * 100) / 100,
        p7: Math.round(c.p7 * 100) / 100,
        p30: Math.round(c.p30 * 100) / 100
      };
    });

    hist.push({
      date: today,
      bullish: topBull,
      lagging: topLag
    });

    /* Trim to MAX_DAYS */
    if (hist.length > MAX_DAYS) hist = hist.slice(-MAX_DAYS);
    saveHistory(hist);
  }

  /* ── Compare past signals with current prices ── */
  function getProvenSignals() {
    var hist = loadHistory();
    if (!hist.length || typeof coins === 'undefined' || !coins.length) return [];

    /* Build current price map */
    var priceMap = {};
    coins.forEach(function(c) { priceMap[c.id] = c.price; });

    var proven = [];
    var now = new Date();

    hist.forEach(function(snap) {
      var snapDate = new Date(snap.date + 'T00:00:00');
      var daysAgo = Math.round((now - snapDate) / (1000 * 60 * 60 * 24));

      /* Only show signals that are 7+ days old */
      if (daysAgo < 7) return;

      /* Check bullish signals — did they go up? */
      snap.bullish.forEach(function(entry) {
        var currentPrice = priceMap[entry.id];
        if (!currentPrice || !entry.price) return;

        var change = ((currentPrice - entry.price) / entry.price) * 100;
        var correct = change > 2; /* At least +2% to count as correct */

        if (correct) {
          proven.push({
            id: entry.id,
            sym: entry.sym,
            name: entry.name,
            signal: entry.signal,
            extras: entry.extras || [],
            date: snap.date,
            daysAgo: daysAgo,
            priceThen: entry.price,
            priceNow: currentPrice,
            scoreThen: entry.score,
            change: Math.round(change * 10) / 10,
            type: 'bullish',
            correct: true
          });
        }
      });

      /* Check lagging signals — did they stay lagging or recover? (confirm lagging = correct) */
      snap.lagging.forEach(function(entry) {
        var currentPrice = priceMap[entry.id];
        if (!currentPrice || !entry.price) return;

        var change = ((currentPrice - entry.price) / entry.price) * 100;
        var correct = change < -2; /* Still dropping = lagging signal was correct */

        if (correct) {
          proven.push({
            id: entry.id,
            sym: entry.sym,
            name: entry.name,
            signal: entry.signal,
            extras: entry.extras || [],
            date: snap.date,
            daysAgo: daysAgo,
            priceThen: entry.price,
            priceNow: currentPrice,
            scoreThen: entry.score,
            change: Math.round(change * 10) / 10,
            type: 'lagging',
            correct: true
          });
        }
      });
    });

    /* Sort by absolute change magnitude — most impressive first */
    proven.sort(function(a, b) { return Math.abs(b.change) - Math.abs(a.change); });

    /* Deduplicate by coin ID — keep the most impressive result */
    var seen = {};
    proven = proven.filter(function(p) {
      if (seen[p.id]) return false;
      seen[p.id] = true;
      return true;
    });

    return proven.slice(0, 8); /* Top 8 proven signals */
  }

  /* ── Get accuracy stats ── */
  function getAccuracyStats() {
    var hist = loadHistory();
    if (!hist.length || typeof coins === 'undefined' || !coins.length) return null;

    var priceMap = {};
    coins.forEach(function(c) { priceMap[c.id] = c.price; });

    var now = new Date();
    var totalBull = 0, correctBull = 0, totalLag = 0, correctLag = 0;

    hist.forEach(function(snap) {
      var snapDate = new Date(snap.date + 'T00:00:00');
      var daysAgo = Math.round((now - snapDate) / (1000 * 60 * 60 * 24));
      if (daysAgo < 7) return;

      snap.bullish.forEach(function(entry) {
        var cp = priceMap[entry.id];
        if (!cp || !entry.price) return;
        totalBull++;
        var change = ((cp - entry.price) / entry.price) * 100;
        if (change > 0) correctBull++;
      });

      snap.lagging.forEach(function(entry) {
        var cp = priceMap[entry.id];
        if (!cp || !entry.price) return;
        totalLag++;
        var change = ((cp - entry.price) / entry.price) * 100;
        if (change < 0) correctLag++;
      });
    });

    var total = totalBull + totalLag;
    var correct = correctBull + correctLag;
    if (total === 0) return null;

    return {
      total: total,
      correct: correct,
      accuracy: Math.round((correct / total) * 100),
      bullTotal: totalBull,
      bullCorrect: correctBull,
      lagTotal: totalLag,
      lagCorrect: correctLag
    };
  }

  /* ── Format price ── */
  function fmtP(p) {
    if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
    if (p >= 1)    return '$' + p.toFixed(2);
    if (p >= 0.01) return '$' + p.toFixed(4);
    return '$' + p.toPrecision(4);
  }

  /* ── Render the track record UI ── */
  function render() {
    var container = document.getElementById('signal-track-record');
    if (!container) return;

    var proven = getProvenSignals();
    var stats  = getAccuracyStats();
    var hist   = loadHistory();

    /* Not enough data yet */
    if (!hist.length || hist.length < 2) {
      container.innerHTML = '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">📊</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Signal tracking started. Come back in 7 days to see how our signals performed.'
        + '<br>Snapshots saved: <strong style="color:var(--bnb);">' + hist.length + '</strong> / 7 needed'
        + '</div></div>';
      container.style.display = '';
      return;
    }

    if (hist.length >= 2 && !proven.length && !stats) {
      container.innerHTML = '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">⏳</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Tracking ' + hist.length + ' days of signals. Results appear after 7 days.'
        + '</div></div>';
      container.style.display = '';
      return;
    }

    var html = '';

    /* ── Accuracy header ── */
    if (stats) {
      var accColor = stats.accuracy >= 65 ? 'var(--green)' : stats.accuracy >= 50 ? 'var(--bnb)' : 'var(--red)';
      html += '<div class="str-stats">'
        + '<div class="str-stats-num" style="color:' + accColor + ';">' + stats.accuracy + '%</div>'
        + '<div class="str-stats-lbl">Signal Accuracy</div>'
        + '<div class="str-stats-detail">'
        + '<span>' + stats.correct + '/' + stats.total + ' signals confirmed</span>'
        + '<span style="color:var(--muted);"> · </span>'
        + '<span style="color:var(--green);">Bullish ' + stats.bullCorrect + '/' + stats.bullTotal + '</span>'
        + '<span style="color:var(--muted);"> · </span>'
        + '<span style="color:var(--red);">Lagging ' + stats.lagCorrect + '/' + stats.lagTotal + '</span>'
        + '</div></div>';
    }

    /* ── Proven signals list ── */
    if (proven.length) {
      html += '<div class="str-list">';
      proven.forEach(function(p) {
        var isBull = p.type === 'bullish';
        var icon = isBull ? '🟢' : '🔴';
        var changeStr = (p.change >= 0 ? '+' : '') + p.change + '%';
        var changeColor = p.change >= 0 ? 'var(--green)' : 'var(--red)';
        var signalBadge = p.signal;
        if (p.extras && p.extras.length) signalBadge = p.extras[0];

        html += '<div class="str-item" onclick="SignalHistory.openDetail(\'' + p.id + '\')">'
          + '<div class="str-item-top">'
          + '<span class="str-item-icon">' + icon + '</span>'
          + '<span class="str-item-sym">' + p.sym + '</span>'
          + '<span class="str-item-signal ' + (isBull ? 'bull' : 'bear') + '">' + signalBadge + '</span>'
          + '<span class="str-item-ago">' + p.daysAgo + 'd ago</span>'
          + '</div>'
          + '<div class="str-item-bot">'
          + '<span class="str-item-price">' + fmtP(p.priceThen) + ' → ' + fmtP(p.priceNow) + '</span>'
          + '<span class="str-item-change" style="color:' + changeColor + ';">' + changeStr + '</span>'
          + '</div>'
          + '<div class="str-item-proof">'
          + (isBull
            ? 'Flagged as <strong style="color:var(--green);">' + p.signal + '</strong> (score ' + p.scoreThen + ') — confirmed ✓'
            : 'Flagged as <strong style="color:var(--red);">' + p.signal + '</strong> (score ' + p.scoreThen + ') — confirmed ✓')
          + '</div>'
          + '<div class="str-item-share">'
          + '<button class="str-share-btn" onclick="event.stopPropagation();SignalHistory.shareProven(\'' + p.id + '\')" title="Share this signal">Share this win</button>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    container.style.display = '';
  }

  /* ── Open coin detail when clicking a proven signal ── */
  function openDetail(coinId) {
    if (typeof openTileDetail === 'function') {
      var c = coins.find(function(x) { return x.id === coinId; });
      if (c) openTileDetail(c);
    }
  }

  /* ── Generate "Told You So" share card ── */
  function shareProven(coinId) {
    var proven = getProvenSignals();
    var p = proven.find(function(x) { return x.id === coinId; });
    if (!p) return;

    var W = 1200, H = 630;
    var can = document.createElement('canvas');
    can.width = W; can.height = H;
    var ctx = can.getContext('2d');

    /* Background */
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#080c12');
    bg.addColorStop(0.4, '#0d1420');
    bg.addColorStop(1, '#080c12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Grid */
    ctx.strokeStyle = 'rgba(243,186,47,0.025)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    /* Gold top accent */
    var gold = ctx.createLinearGradient(0, 0, W, 0);
    gold.addColorStop(0, 'rgba(243,186,47,0)');
    gold.addColorStop(0.3, 'rgba(243,186,47,0.9)');
    gold.addColorStop(0.7, 'rgba(243,186,47,0.9)');
    gold.addColorStop(1, 'rgba(243,186,47,0)');
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, W, 4);

    /* "CALLED IT" badge */
    var isBull = p.type === 'bullish';
    var badgeColor = isBull ? '#00c896' : '#ff4560';
    ctx.fillStyle = isBull ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,96,0.12)';
    _roundRect(ctx, 60, 40, 260, 50, 8);
    ctx.fill();
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 2;
    _roundRect(ctx, 60, 40, 260, 50, 8);
    ctx.stroke();
    ctx.fillStyle = badgeColor;
    ctx.font = 'bold 28px "IBM Plex Mono", monospace';
    ctx.fillText(isBull ? '🟢 CALLED IT' : '🔴 CALLED IT', 80, 74);

    /* Days ago */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(p.daysAgo + ' days ago', W - 70, 74);
    ctx.textAlign = 'left';

    /* Coin symbol and signal */
    ctx.fillStyle = '#f3ba2f';
    ctx.font = 'bold 80px "IBM Plex Mono", monospace';
    ctx.fillText(p.sym, 70, 170);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '26px "IBM Plex Mono", monospace';
    ctx.fillText('Signaled: ' + p.signal + ' (Score ' + p.scoreThen + ')', 70, 210);

    /* Price comparison — big */
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '24px "IBM Plex Mono", monospace';
    ctx.fillText('PRICE THEN', 70, 280);
    ctx.fillText('PRICE NOW', W / 2 + 30, 280);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "IBM Plex Mono", monospace';
    ctx.fillText(fmtP(p.priceThen), 70, 340);

    /* Arrow */
    ctx.fillStyle = 'rgba(243,186,47,0.6)';
    ctx.font = '42px "IBM Plex Mono", monospace';
    ctx.fillText('→', W / 2 - 30, 335);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "IBM Plex Mono", monospace';
    ctx.fillText(fmtP(p.priceNow), W / 2 + 30, 340);

    /* Change percentage — huge */
    var changeStr = (p.change >= 0 ? '+' : '') + p.change + '%';
    ctx.fillStyle = p.change >= 0 ? '#00c896' : '#ff4560';
    ctx.font = 'bold 72px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(changeStr, W / 2, 440);
    ctx.textAlign = 'left';

    /* CTA */
    ctx.fillStyle = 'rgba(243,186,47,0.06)';
    _roundRect(ctx, 70, 475, W - 140, 42, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243,186,47,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, 70, 475, W - 140, 42, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(243,186,47,0.85)';
    ctx.font = 'bold 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Free rotation signals at Rotator — see what\'s next', W / 2, 502);
    ctx.textAlign = 'left';

    /* Footer */
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(70, H - 60, W - 140, 1);
    ctx.fillStyle = '#f3ba2f';
    ctx.font = 'bold 28px "IBM Plex Mono", monospace';
    ctx.fillText('ROTATOR', 70, H - 25);
    ctx.fillStyle = 'rgba(243,186,47,0.7)';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('rotatortool-official.github.io', W - 70, H - 25);
    ctx.textAlign = 'left';

    /* Gold bottom */
    ctx.fillStyle = gold;
    ctx.fillRect(0, H - 4, W, 4);

    /* Show in viral modal */
    try {
      can.toBlob(function(blob) {
        if (!blob) return;
        _viralBlob = blob;
        _viralSym = p.sym;
        _viralCanvas = can;

        var preview = document.getElementById('viral-share-preview');
        if (preview) {
          var url = URL.createObjectURL(blob);
          preview.innerHTML = '<img src="' + url + '" alt="' + p.sym + ' signal proof">';
        }

        /* Custom "told you so" message */
        var copyEl = document.getElementById('viral-copy-text');
        if (copyEl) {
          var ref = (typeof getMyReferralLink === 'function') ? getMyReferralLink() : 'https://rotatortool-official.github.io/';
          copyEl.textContent = 'Rotator flagged ' + p.sym + ' as ' + p.signal + ' ' + p.daysAgo + ' days ago at ' + fmtP(p.priceThen) + '. It\'s now ' + fmtP(p.priceNow) + ' (' + changeStr + '). Free signals:\n\n' + ref;
        }

        var nativeBtn = document.getElementById('viral-native-btn');
        if (nativeBtn) nativeBtn.style.display = 'flex';

        openModal('viral-share-modal');
      }, 'image/png');
    } catch(e) {}
  }

  /* ── Public API ── */
  return {
    takeSnapshot: takeSnapshot,
    render: render,
    openDetail: openDetail,
    shareProven: shareProven,
    getProvenSignals: getProvenSignals,
    getAccuracyStats: getAccuracyStats,
    loadHistory: loadHistory
  };

})();
