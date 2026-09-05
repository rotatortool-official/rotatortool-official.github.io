/* ══════════════════════════════════════════════════════════════════
   signal-assistant.js  —  Pro "Signal Assistant" chat (roadmap Step D)

   Talks to the signal-assistant Edge Function, which answers ONLY from
   the current signal_runs/signal_run_items row (the same server-
   authoritative data the site and the Telegram bot read — see Step B/C).
   No scoring or data logic lives here — this file is UI + a fetch call.

   Pro gating follows the same pattern as joinTelegram() in
   pro-system.js: check `isPro`, open the upsell modal if not, otherwise
   proceed. The server ALSO re-checks Pro status (a spoofed client flag
   can't get a free answer) — see the Edge Function's header comment.

   NOT LIVE YET, ON PURPOSE (2026-09-05). The backend is fully built and
   deployed (Edge Function, DB rate-limit RPC — see
   promptove/07-roadmap-2026-09-05.md, Step D) but ANTHROPIC_API_KEY is
   deliberately unset: every question would be a real Anthropic API call
   billed to the developer's own account, with no ceiling on TOTAL spend
   across every Pro user (only a per-user daily cap) — too much exposure
   for a one-person, ~$0-50/month-budget project to turn on without first
   knowing real Pro usage volume. SIGNAL_ASSISTANT_LIVE is the single
   switch: flip it to true (and set the API key) once that's decided —
   nothing else needs to change. Until then this shows an honest "not
   live yet, here's why" notice instead of silently failing the fetch. */
var SIGNAL_ASSISTANT_LIVE = false;

var _saMessages = [];   // {role:'user'|'assistant', content:string}[]
var _saBusy = false;

function openSignalAssistant() {
  if (!isPro) { openPro(); return; }
  if (window.Analytics) Analytics.track('Signal Assistant Opened');
  openModal('signal-assistant-modal');
  _saRender();
  if (!SIGNAL_ASSISTANT_LIVE) return;
  var input = document.getElementById('sa-input');
  if (input) setTimeout(function () { input.focus(); }, 50);
}

function _saEscape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Very small markdown-ish pass: the assistant is asked for short bullets/
// tables in plain text, not real markdown, so this only handles the
// couple of things that show up in practice (line breaks, **bold**).
function _saFormat(text) {
  var esc = _saEscape(text);
  esc = esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return esc.replace(/\n/g, '<br>');
}

function _saRender() {
  var box = document.getElementById('sa-messages');
  var form = document.getElementById('sa-form');
  if (!box) return;

  if (!SIGNAL_ASSISTANT_LIVE) {
    if (form) form.style.display = 'none';
    box.innerHTML = '<div style="text-align:center;padding:20px 14px;">'
      + '<div style="font-size:28px;margin-bottom:10px;">🚧</div>'
      + '<div style="font-size:13px;color:var(--text);font-weight:600;margin-bottom:8px;">Not live yet</div>'
      + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
      + 'This feature is built but switched off for now. Answering questions calls a paid AI service — '
      + 'and Rotator is built and run by one person on a very small budget, so it stays off until that cost '
      + "makes sense to carry. Everything else on the site (scores, zones, rotation signals) is unaffected — "
      + "this only touches the chat."
      + '</div></div>';
    return;
  }
  if (form) form.style.display = 'flex';

  if (!_saMessages.length) {
    box.innerHTML = '<div style="color:var(--muted);font-size:12px;text-align:center;padding:24px 12px;">'
      + 'Ask about the current rotation signals — e.g. <em>"what looks weak right now?"</em> or <em>"how is SOL doing?"</em>'
      + '</div>';
    return;
  }
  var html = '';
  _saMessages.forEach(function (m) {
    var isUser = m.role === 'user';
    html += '<div style="display:flex;' + (isUser ? 'justify-content:flex-end;' : 'justify-content:flex-start;') + 'margin-bottom:10px;">'
      + '<div style="max-width:82%;padding:9px 13px;border-radius:10px;font-size:13px;line-height:1.55;'
      + (isUser
        ? 'background:var(--bnb);color:#0a0d12;font-weight:600;'
        : 'background:var(--bg3);border:1px solid var(--bdr2);color:var(--text);')
      + '">' + _saFormat(m.content) + '</div></div>';
  });
  if (_saBusy) {
    html += '<div style="display:flex;justify-content:flex-start;margin-bottom:10px;">'
      + '<div style="padding:9px 13px;border-radius:10px;font-size:13px;background:var(--bg3);border:1px solid var(--bdr2);color:var(--muted);font-style:italic;">thinking…</div></div>';
  }
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

function _saShowError(msg) {
  var err = document.getElementById('sa-error');
  if (!err) return;
  err.textContent = msg;
  err.style.display = msg ? '' : 'none';
}

async function sendSignalAssistantMessage(ev) {
  if (ev) ev.preventDefault();
  if (_saBusy) return;
  var input = document.getElementById('sa-input');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  if (text.length > 1000) { _saShowError('Keep questions under 1000 characters.'); return; }

  _saShowError('');
  _saMessages.push({ role: 'user', content: text });
  input.value = '';
  _saBusy = true;
  _saRender();

  try {
    var uid = (typeof getMyId === 'function') ? getMyId() : localStorage.getItem('rot_uid');
    var res = await fetch(SUPA_URL + '/functions/v1/signal-assistant', {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rot_uid: uid, messages: _saMessages }),
    });
    var payload = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      _saMessages.pop(); // don't keep a question that never got answered
      if (payload.error === 'not_pro') {
        _saBusy = false; _saRender();
        closeModal('signal-assistant-modal');
        openPro();
        return;
      }
      if (payload.error === 'rate_limited') {
        _saShowError('Daily question limit reached (' + (payload.limit || 30) + '/day). Try again tomorrow.');
      } else if (payload.error === 'no_signal_run') {
        _saShowError('No signal data available right now — try again in a few minutes.');
      } else {
        _saShowError('Something went wrong. Please try again.');
      }
      _saBusy = false; _saRender();
      return;
    }

    _saMessages.push({ role: 'assistant', content: payload.reply || '(no reply)' });
  } catch (e) {
    _saMessages.pop();
    _saShowError('Could not reach the assistant — check your connection and try again.');
  } finally {
    _saBusy = false;
    _saRender();
  }
}

function saInputKeydown(ev) {
  if (ev.key === 'Enter' && !ev.shiftKey) sendSignalAssistantMessage(ev);
}
