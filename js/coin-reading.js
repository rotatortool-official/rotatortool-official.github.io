/* ══════════════════════════════════════════════════════════════════
   coin-reading.js — the top of the coin window: warnings, a reading,
   and the turn signals behind it. Added 2026-09-26 (promptove/67).

   WHY. The window had thirteen sections and five of them carried some
   part of "is this coin turning": the RSI panel, technical events,
   derivatives, the badge row and the Insight Engine. A reader had to
   assemble a conclusion from them, with nothing saying which readings
   had ever been shown to work. Daniel: "after opening the modal the user
   needs to draw a conclusion about the coin: is it going to cool off, or
   has it performed poorly but indicators show potential reversal".

   WHAT IT SAYS, AND WHAT IT DOES NOT. The reading answers two questions
   the data can support: where does the coin stand (ahead, lagging, or in
   the middle), and which cooling or turn-up signs are present right now.
   It does NOT forecast. Every sign carries its tested record from
   ROTATOR_EVIDENCE.turnSignals (rotator-backtest/trend-turn-test.js,
   pre-registered), and the reading ends by saying how far the signs can
   be trusted. On 2026-09-26 the honest answer is "none has passed its
   test yet", and the window says exactly that.

   ONE OWNER. Nothing here computes an indicator. It reads what the
   engine, the sync functions and the detectors already produced:
     c._candidate / c._candidateClass   engine classification
     c._positioning                      engine futures positioning
     coinTechnicals[sym]                 RSI, 60/125 trend state
     _eventsBySym[sym]                   detected events (3-day window)
     _futuresBySym[sym]                  funding, OI, taker flow
     _tokenUnlocks, delistedStatus,
     monitoringSymbols                   holder and exchange risks
   Pure presentation, same rule as signals.js.
══════════════════════════════════════════════════════════════════ */

var _TD_SLOWING_GAP = 5;   /* points: last week this much weaker than the week before = momentum slowing */

function _tdEvChip(ev) {
  var E = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.turnSignals) || {};
  var t = ev && E[ev];
  var html = function(cls, text) { return '<span class="td-ev-chip ' + cls + '">' + text + '</span>'; };
  if (ev === 'etfOutflowBTC') {
    var F = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.etfFlows) || null;
    if (F && F.strongOutflow) return html('weak', 'Tested: big outflow weeks were followed by a weaker BTC week (' + F.strongOutflow.excess7.toFixed(2) + '% vs average, ' + F.days + ' trading days) · weak, not proven');
  }
  if (!t) return html('untested', 'Not tested yet');
  if (t.verdict === 'weak' && ev === 'goldenCross') {
    return html('weak', 'Tested: ' + t.win + '% at ' + t.h + ' days, ' + t.win30 + '% at 30 (' + t.n + ' cases) · not proven');
  }
  if (t.verdict === 'weak') {
    return html('weak', 'Tested: ' + t.win + '% beat the market over ' + t.h + ' days (' + t.n + ' cases) · weak, not proven');
  }
  if (t.verdict === 'contrary') {
    return html('contrary', 'Tested: not a warning · ' + t.win30 + '% beat the market over 30 days (' + t.n + ' cases)');
  }
  if (t.verdict === 'few')    return html('untested', 'Tested: only ' + t.n + ' cases, too few to judge');
  if (t.verdict === 'noedge') return html('untested', 'Tested: no edge on its own');
  return html('untested', 'Not tested yet');
}

function _tdPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

/* Collect the signs for one coin. Each is { dir: 'up'|'down'|'info',
   title, detail, ev }. 'up' = turn-up sign, 'down' = cooling or
   weakening sign, 'info' = context that is shown but not counted
   (including readings whose test says they are NOT what they look like). */
function _tdSigns(c) {
  var up = [], down = [], info = [];
  var tech = (typeof coinTechnicals !== 'undefined' && coinTechnicals[c.sym]) || null;
  var rsi = tech && tech.rsiD != null ? tech.rsiD : (c._rsi != null ? c._rsi : null);
  var cand = c._candidate || null;
  var pos = c._positioning || null;
  var f = (typeof _futuresBySym !== 'undefined' && _futuresBySym[c.sym]) || null;
  var evs = (typeof _eventsBySym !== 'undefined' && _eventsBySym[c.sym]) || [];
  var seen = {};
  var ev = function(type) { return evs.filter(function(e) { return e.event_type === type; })[0] || null; };

  /* ── RSI bounces (detected events) ── */
  var rc = ev('rsi_reclaim');
  if (rc) {
    var d = rc.detail || {}, nb = d.days_below != null ? Number(d.days_below) : null;
    var nbTxt = nb == null ? '' : nb + (d.days_below_is_floor ? '+' : '') + (nb === 1 ? ' day' : ' days');
    if (d.fast) up.push({ title: 'Quick RSI bounce', when: rc.event_date, detail: 'RSI back above 30 after ' + nbTxt + ' below', ev: 'rsiQuickReclaim' });
    else if ((nb != null && nb >= 6) || d.days_below_is_floor) down.push({ title: 'Slow RSI bounce', when: rc.event_date, detail: 'RSI back above 30 only after ' + nbTxt + ' below; slow bounces mostly trailed the market in earlier data', ev: 'rsiSlowReclaim' });
    else info.push({ title: 'RSI back above 30', when: rc.event_date, detail: 'after ' + nbTxt + ' below', ev: null });
    seen.reclaim = true;
  }

  /* ── The 60/125 trend: a recent cross is a sign, the state is a fact ── */
  /* 7 days, not longer: the cross was tested at a 7-day horizon, so it
     stops being shown as a sign once that window has passed. */
  if (tech && tech.cross && tech.crossDays != null && tech.crossDays <= 7) {
    if (tech.cross === 'golden') up.push({ title: 'Golden cross', when: tech.crossDays === 0 ? 'latest close' : tech.crossDays + ' days ago', detail: '60-day average crossed above the 125-day', ev: 'goldenCross' });
    else if (tech.cross === 'death') info.push({ title: 'Death cross', when: tech.crossDays === 0 ? 'latest close' : tech.crossDays + ' days ago', detail: '60-day average crossed below the 125-day. Tested, it was not a warning', ev: 'deathCross' });
  }

  /* ── RSI level now ── */
  if (rsi != null && rsi >= 70) down.push({ title: rsi >= 80 ? 'Running hot' : 'Overbought', when: 'now', detail: 'Daily RSI ' + rsi.toFixed(1), ev: null });
  else if (rsi != null && rsi <= 30) info.push({ title: 'Oversold', when: 'now', detail: 'Daily RSI ' + rsi.toFixed(1) + '. Oversold alone has not beaten the market', ev: 'rsiOversold' });

  /* ── Momentum pace, from the engine's own candidate numbers ── */
  if (cand && typeof cand.recentWeek === 'number' && typeof cand.priorWeek === 'number') {
    var rw = cand.recentWeek, pw = cand.priorWeek;
    if (c.p30 > 0 && rw < pw - _TD_SLOWING_GAP) {
      down.push({ title: 'Momentum slowing', when: 'this week', detail: 'Last 7 days ' + _tdPct(rw) + ' against ' + _tdPct(pw) + ' the week before', ev: null });
    }
    if (c.p30 < 0 && cand.accelerating) {
      down.push({ title: 'Decline speeding up', when: 'this week', detail: 'Last 7 days ' + _tdPct(rw) + ' against ' + _tdPct(pw) + ' the week before', ev: null });
    } else if (c.p30 < 0 && cand.stabilizing) {
      up.push({ title: 'Decline slowing', when: 'this week', detail: 'Last 7 days ' + _tdPct(rw) + ', better than its 30-day pace of ' + _tdPct(cand.pace30) + ' a week', ev: null });
    }
  }
  if (c._candidateClass === 'EXTENDED' || c._candidateClass === 'COOLDOWN') {
    down.push({ title: 'Big 24-hour jump', when: 'today', detail: _tdPct(c.p24 || 0) + ' in 24 hours', ev: null });
  }

  /* ── Futures positioning ── */
  /* Crowding is RELATIVE. The engine's crowded_long state fired on 41%
     of perpetuals on 2026-09-26, because crypto futures lean long by
     default, so on its own it is the normal state, not news. A coin is
     called crowded only when its long/short ratio is in the most extreme
     10% of all perpetuals, funding is heavy, or the daily detector raised
     a crowding event. Same idea as TAKER FLOW's percentile labels. */
  var fund = f && f.funding_rate != null ? Number(f.funding_rate) * 100 : null;   /* % per 8h */
  var lsv = f && f.long_short_ratio != null ? Number(f.long_short_ratio) : (pos && pos.longShort != null ? Number(pos.longShort) : null);
  var lsp = (lsv != null && typeof _futuresPercentile === 'function')
    ? _futuresPercentile(function(r) { return r.long_short_ratio != null ? Number(r.long_short_ratio) : null; }, lsv) : null;
  if ((lsp && lsp.pct >= 0.90) || (fund != null && fund >= 0.05) || ev('futures_long_crowded')) {
    down.push({ title: 'Crowded longs', when: 'now', detail: (lsv != null ? lsv.toFixed(2) + ' long accounts per short' + (lsp ? ', among the most long-heavy 10% of ' + lsp.n + ' perpetuals' : '') : 'Longs paying heavily to stay in') + '. Crowded trades can unwind fast', ev: null });
  } else if ((lsp && lsp.pct <= 0.10) || (fund != null && fund <= -0.015) || ev('futures_short_crowded')) {
    up.push({ title: 'Crowded shorts', when: 'now', detail: (lsv != null ? lsv.toFixed(2) + ' long accounts per short' + (lsp ? ', among the most short-heavy 10% of ' + lsp.n + ' perpetuals' : '') : 'Shorts paying longs') + '. This is the setup a short squeeze needs', ev: null });
  }
  if (f && f.oi_change_24h_pct != null && f.price_change_pct_24h != null) {
    var oi24 = Number(f.oi_change_24h_pct), pc24 = Number(f.price_change_pct_24h);
    if (pc24 > 1 && oi24 < -3) down.push({ title: 'Rally on short covering', when: '24 hours', detail: 'Price ' + _tdPct(pc24) + ' while open interest ' + _tdPct(oi24) + ': shorts closing, not new buyers', ev: null });
  }
  if (f && f.taker_buy_sell_ratio != null && typeof _futuresPercentile === 'function') {
    var tk = Number(f.taker_buy_sell_ratio);
    var tp = _futuresPercentile(function(r) { return r.taker_buy_sell_ratio != null ? Number(r.taker_buy_sell_ratio) : null; }, tk);
    if (tp && tp.pct >= 0.85) up.push({ title: 'Heavy aggressive buying', when: 'now', detail: 'Taker buy/sell ' + tk.toFixed(2) + ', top 15% of ' + tp.n + ' perpetuals', ev: null });
    else if (tp && tp.pct <= 0.15) down.push({ title: 'Heavy aggressive selling', when: 'now', detail: 'Taker buy/sell ' + tk.toFixed(2) + ', bottom 15% of ' + tp.n + ' perpetuals', ev: null });
  }

  /* ── US spot ETF flows, Bitcoin and Ether only (promptove/68) ──
     The server's own reading (sync-etf-flows). Money leaving is a
     weakening sign: strong outflow weeks came before a weaker BTC week in
     the test, weakly. Everything else is context, since inflows mostly
     follow the price rather than lead it. ETH flows were never tested. */
  var etfA = c.id === 'bitcoin' ? 'BTC' : c.id === 'ethereum' ? 'ETH' : null;
  var etfS = etfA && typeof _etfFlows !== 'undefined' && _etfFlows && _etfFlows[etfA];
  if (etfS && etfS.last && !etfS.error) {
    var etfRow = { title: 'ETF flows: ' + etfS.headline, when: etfS.last.day ? Number(etfS.last.day.slice(8, 10)) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(etfS.last.day.slice(5, 7)) - 1] : '',
      detail: _etfM(etfS.last.total) + ' on the latest day, ' + _etfM(etfS.sum5) + ' over 5 trading days. Source: Farside Investors', ev: null };
    if (etfS.tone === 'out') { etfRow.ev = etfA === 'BTC' ? 'etfOutflowBTC' : 'etfOutflowETH'; down.push(etfRow); }
    else info.push(etfRow);
  }

  /* ── Market context ── */
  var mo = window.ROTATOR_RUN && window.ROTATOR_RUN.marketOversold;
  if (mo && mo.measured === true && mo.active === true) {
    info.push({ title: 'Whole market oversold', when: 'now', detail: Math.round(mo.breadthNow * 100) + '% of coins at 4-hour RSI below ' + (mo.rules ? mo.rules.rsiBelow : 20) + '. About the market, not this coin', ev: null });
  }
  return { up: up, down: down, info: info };
}

function _tdStatus(c) {
  if (c.score >= 55) return 'ahead';
  if (c.score <= 35) return 'lagging';
  return 'middle';
}

function _tdRow(s, dir) {
  var icon = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•';
  return '<div class="td-turn-row ' + dir + '">'
    + '<div class="td-turn-hd"><span class="td-turn-ico">' + icon + '</span><span class="td-turn-title">' + _esc(s.title) + '</span>'
    + '<span class="td-turn-when">' + _esc(s.when || '') + '</span></div>'
    + '<div class="td-turn-detail">' + _esc(s.detail || '') + '</div>'
    + (dir === 'info' && !s.ev ? '' : _tdEvChip(s.ev))
    + '</div>';
}

/* Fill #td-warn, #td-reading, #td-turns and #td-score-extra. */
function renderCoinReading(c) {
  var warnEl = document.getElementById('td-warn');
  var readEl = document.getElementById('td-reading');
  var turnsEl = document.getElementById('td-turns');
  var extraEl = document.getElementById('td-score-extra');
  if (!readEl || !turnsEl) return;

  /* ── 1. Warnings: holder and exchange risks, and why the coin is kept
     off the buy list. The same facts the holding tile and the Telegram
     digest use, plus the engine's own exclusion reasons. ── */
  if (warnEl) {
    var w = [];
    var held = (typeof isHeldCoin === 'function') && isHeldCoin(c);
    var risk = (typeof _holderRisk === 'function') ? _holderRisk(c) : '';
    if (risk) w.push((held ? 'You hold this · ' : '') + risk);
    var EXCL = {
      illiquid: 'Thinly traded, so it is kept off the buy list',
      no_market_cap: 'No market cap reported, so it is kept off the buy list',
      incomplete_history: 'Not enough price history yet, so it is kept off the buy list'
    };
    /* Not for stocks: every equity carries no_market_cap and equity by
       design (they are ranked in their own universe), so the reason would
       read as a fault when it is not one. */
    if (!c.isStock) (c._exclusions || []).forEach(function(x) { if (EXCL[x]) w.push(EXCL[x]); });
    warnEl.innerHTML = w.map(function(t) { return '<div class="td-warn-row">⚠ ' + _esc(t) + '</div>'; }).join('');
  }

  if (c.isStock || c.isStable) {
    readEl.innerHTML = c.isStock
      ? '<div class="td-reading"><div class="td-reading-hd">Tokenized stock</div>'
        + '<div class="td-reading-sub">Turn signals are measured on crypto only. The score for a stock is partial (out of 70) and not comparable with crypto.</div></div>'
      : '<div class="td-reading"><div class="td-reading-hd">Stablecoin</div>'
        + '<div class="td-reading-sub">Pegged to a currency, so it has no trend to turn. Its score is not a signal.</div></div>';
    turnsEl.innerHTML = '';
    document.getElementById('td-turns-sec').style.display = 'none';
    if (extraEl) extraEl.innerHTML = '';
    return;
  }
  document.getElementById('td-turns-sec').style.display = '';

  var S = _tdSigns(c), st = _tdStatus(c);
  var nUp = S.up.length, nDown = S.down.length;
  var plural = function(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); };

  /* ── 2. The reading: a status and the conclusion the signs support ── */
  var head, sub, tone;
  if (st === 'ahead') {
    head = 'Has run ahead · ' + (nDown ? plural(nDown, 'cooling sign') : 'no cooling signs yet');
    sub = nDown ? 'It has beaten most of the market, and some readings suggest the move is tiring.'
                : 'It has beaten most of the market, and nothing yet suggests the move is tiring.';
    tone = nDown ? 'warn' : 'good';
  } else if (st === 'lagging') {
    head = 'Has lagged · ' + (nUp ? plural(nUp, 'turn-up sign') : 'no turn-up signs yet');
    sub = nUp && nDown ? 'It has trailed most of the market. Some readings suggest a turn up, others that it is still weakening.'
        : nUp ? 'It has trailed most of the market, and some readings suggest a turn up may be starting.'
        : nDown ? 'It has trailed most of the market and is still weakening, with nothing yet suggesting a turn.'
        : 'It has trailed most of the market, with nothing yet suggesting a turn.';
    tone = nUp ? 'good' : 'bad';
  } else {
    head = 'Middle of the pack · ' + (nUp || nDown ? nUp + ' up, ' + nDown + ' down' : 'no turn signs');
    sub = nUp > nDown ? 'Neither leading nor lagging, with more signs pointing up than down.'
        : nDown > nUp ? 'Neither leading nor lagging, with more signs pointing to cooling.'
        : nUp ? 'Neither leading nor lagging, with signs pointing both ways.'
        : 'Neither leading nor lagging, and no turn signs either way.';
    tone = 'neutral';
  }

  /* How far to trust it: stamped from the evidence, never typed. */
  var E = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.turnSignals) || null;
  var anyTested = S.up.concat(S.down).some(function(s) { return s.ev && E && E[s.ev]; });
  var trust = !(nUp || nDown) ? ''
    : anyTested && E && E.rsiQuickReclaim
      ? 'None of these signs has passed its test yet. The closest, the quick RSI bounce, beat the market '
        + E.rsiQuickReclaim.win + '% of the time against ' + E.random + '% for a random pick. A reading, not a forecast.'
      : 'None of these signs has been tested yet. A reading, not a forecast.';

  var tech = (typeof coinTechnicals !== 'undefined' && coinTechnicals[c.sym]) || null;
  var facts = [];
  facts.push('7D ' + _tdPct(c.p7 || 0));
  facts.push('30D ' + _tdPct(c.p30 || 0));
  if (tech && tech.cross) {
    facts.push('60D avg ' + (tech.cross === 'golden' ? 'above' : 'below') + ' 125D'
      + (tech.crossDays != null ? ' for ' + tech.crossDays + ' days' : ''));
  }
  if (tech && tech.rsiD != null) facts.push('RSI ' + tech.rsiD.toFixed(0));

  readEl.innerHTML = '<div class="td-reading ' + tone + '">'
    + '<div class="td-reading-hd">' + _esc(head) + '</div>'
    + '<div class="td-reading-sub">' + _esc(sub) + '</div>'
    + '<div class="td-reading-facts">' + facts.map(_esc).join(' · ') + '</div>'
    + (trust ? '<div class="td-reading-trust">' + _esc(trust) + '</div>' : '')
    + '</div>';

  /* ── 3. The signs, grouped, with their records ── */
  /* Group names follow the status, so an up-sign on a coin that has
     already run is not called a "turn". */
  var LBL = { ahead:   ['Signs it may keep going', 'Cooling signs'],
              lagging: ['Turn-up signs', 'Weakening signs'],
              middle:  ['Signs pointing up', 'Signs pointing down'] }[st];
  var html = '';
  if (nUp)   html += '<div class="td-turn-grp">' + LBL[0] + '</div>' + S.up.map(function(s) { return _tdRow(s, 'up'); }).join('');
  if (nDown) html += '<div class="td-turn-grp">' + LBL[1] + '</div>' + S.down.map(function(s) { return _tdRow(s, 'down'); }).join('');
  if (!nUp && !nDown) html += '<div class="td-turn-none">No turn signal on this coin right now.</div>';
  if (S.info.length) html += '<div class="td-turn-grp">Context</div>' + S.info.map(function(s) { return _tdRow(s, 'info'); }).join('');
  turnsEl.innerHTML = html;

  /* ── 4. Score extras: data the engine produced that the window never showed ── */
  if (extraEl) {
    var CLS = {
      STRONG: 'up over 30 days with no pullback yet',
      EXTENDED: 'jumped sharply in the last 24 hours',
      COOLDOWN: 'large 24-hour gain',
      FALLING_KNIFE: 'still falling, and not slowing',
      NOT_OVERSOLD: 'down, but RSI is not low enough to call it washed out',
      CANDIDATE: 'has lagged, RSI is low, and the fall has slowed',
      UNCONFIRMED: 'no RSI reading to confirm anything'
    };
    var ZONE = { buy: 'bottom of the range', sell: 'top of the range', neutral: 'middle of the range' };
    var bits = [];
    if (c._strength != null && isFinite(Number(c._strength))) bits.push('<span><b>Relative strength</b> ' + Math.round(Number(c._strength)) + ' / 100</span>');
    if (c._zone && ZONE[c._zone]) bits.push('<span><b>Zone</b> ' + ZONE[c._zone] + '</span>');
    if (c._candidateClass && CLS[c._candidateClass]) {
      /* STRONG only means the 30-day return is above the pullback line, which
         can be +1% on a coin that has trailed everything else. Say the
         number, so it does not read as "strong" next to "has lagged". */
      var read = c._candidateClass === 'STRONG' ? 'no 30-day pullback yet (30D ' + _tdPct(c.p30 || 0) + ')' : CLS[c._candidateClass];
      bits.push('<span><b>Engine read</b> ' + read + '</span>');
    }
    extraEl.innerHTML = bits.length ? '<div class="td-score-extra">' + bits.join('') + '</div>' : '';
  }
}
