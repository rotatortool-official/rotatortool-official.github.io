// ============================================================
// telegram-webhook — Supabase Edge Function (promptove/71, /73)
//
// Receives private messages to the Rotator bot, so a Pro browser can
// link a Telegram chat for DM alerts. Rotator has no accounts:
//   1. the site calls alert_link_start(rot_uid, lang) and gets a code
//   2. it opens t.me/<bot>?start=<code>; the user taps Start
//   3. Telegram posts "/start <code>" here; the code names the rot_uid,
//      pro_users confirms Pro, and the chat is stored in
//      telegram_subscribers with the site language
// Commands: /start <code> (link), /stop (turn off), /status.
// Replies are in the subscriber's site language (en/mk).
//
// SECURITY. Telegram signs each call with the secret_token given at
// setWebhook; it is derived from SIGNAL_RUN_SYNC_SECRET, so there is no
// new secret to manage, and anything without it is refused. Only
// private chats are answered. Group and channel posts are ignored.
//
// SETUP (once): POST ?setup=1 with the sync token, via
// select public.trigger_telegram_webhook_setup(); It reads the bot's
// username (getMe), registers this URL with setWebhook, and stores the
// username in market_cache['telegram_bot_info'] so the site can build
// the t.me link without hard-coding it. Nothing in the codebase polls
// getUpdates, so a webhook does not collide with the daily posts, which
// only send.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;
const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const TG = `https://api.telegram.org/bot${BOT}`;
const SITE = 'https://rotatortool-official.github.io/';

/* Every reply in English and Macedonian (promptove/73). The wording and
   the button names match the site in each language; the Macedonian
   follows the glossary in copy/glossary-mk.md. */
type Lang = 'en' | 'mk';
const T: Record<Lang, { hello: string; expired: string; notPro: string; connected: string; stopped: string;
  statusOn: (n: number, last: string) => string; statusOff: string; help: string }> = {
  en: {
    hello: 'Hi! Rotator sends <b>Pro</b> members alerts for the coins they hold and watch.\n\n'
      + `To connect, open ${SITE}, go to <b>Alerts for your coins</b> and tap <b>Get these on Telegram</b>.`,
    expired: 'That link has expired. Tap <b>Get these on Telegram</b> on the site again for a fresh one.',
    notPro: 'Telegram alerts are part of Rotator Pro, and this browser is not Pro on our side. '
      + 'If you have Pro, restore it with your recovery key on the site, then try again.',
    connected: '✅ <b>Connected.</b> You will get a message here when something changes on the coins you hold or watch on Rotator: '
      + 'Binance delisting or Monitoring tags, big unlocks, new turn signs, and sharp ETF flow moves for BTC and ETH.\n\n'
      + 'Your coin list updates each time you open Rotator. Send /stop to turn this off.',
    stopped: 'Alerts are off. To turn them back on, tap <b>Get these on Telegram</b> on the site.',
    statusOn: (n, last) => `Alerts are on for ${n} coin${n === 1 ? '' : 's'}.` + (last ? ` Last alert: ${last}.` : ''),
    statusOff: 'Alerts are off for this chat.',
    help: 'Commands: /status, /stop. Alerts are set up from the site, under <b>Alerts for your coins</b>.',
  },
  mk: {
    hello: 'Здраво! Rotator им праќа на <b>Pro</b> членовите известувања за монетите што ги држат и следат.\n\n'
      + `За поврзување, отворете ${SITE}, одете во <b>Известувања за вашите монети</b> и допрете <b>Добивај ги на Telegram</b>.`,
    expired: 'Линкот истече. Допрете <b>Добивај ги на Telegram</b> на страницата уште еднаш за нов линк.',
    notPro: 'Известувањата на Telegram се дел од Rotator Pro, а овој прелистувач кај нас не е Pro. '
      + 'Ако имате Pro, вратете го со вашиот клуч за враќање на страницата, па обидете се повторно.',
    connected: '✅ <b>Поврзано.</b> Тука ќе добиете порака кога ќе се смени нешто кај монетите што ги држите или следите на Rotator: '
      + 'отстранување од листата или ознака Monitoring на Binance, големи отклучувања, нови знаци за свртување и нагли промени во тековите на ETF-овите за BTC и ETH.\n\n'
      + 'Вашата листа на монети се ажурира секогаш кога ќе го отворите Rotator. Испратете /stop за да ги исклучите.',
    stopped: 'Известувањата се исклучени. За повторно да ги вклучите, допрете <b>Добивај ги на Telegram</b> на страницата.',
    statusOn: (n, last) => `Известувањата се вклучени за ${n} ${n === 1 ? 'монета' : 'монети'}.` + (last ? ` Последно известување: ${last}.` : ''),
    statusOff: 'Известувањата се исклучени за овој разговор.',
    help: 'Команди: /status, /stop. Известувањата се поставуваат од страницата, под <b>Известувања за вашите монети</b>.',
  },
};

async function hookSecret(): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SYNC_SECRET + ':telegram-webhook'));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

async function tg(method: string, body: unknown) {
  const r = await fetch(`${TG}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false }));
}
const reply = (chat_id: number, text: string) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true });

async function isPro(uid: string): Promise<boolean> {
  const { data } = await supabase.from('pro_users').select('is_pro,expirres_at').eq('rot_uid', uid).eq('is_pro', true);
  return !!(data || []).find((r: any) => !r.expirres_at || Date.parse(r.expirres_at) > Date.now());
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  /* ── One-off setup, called with the sync token ── */
  if (url.searchParams.get('setup') === '1') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!SYNC_SECRET || token !== SYNC_SECRET) return json({ error: 'unauthorized' }, 401);
    if (!BOT) return json({ error: 'TELEGRAM_BOT_TOKEN not set' }, 500);
    const me = await tg('getMe', {});
    const hook = await tg('setWebhook', {
      url: `${SUPABASE_URL}/functions/v1/telegram-webhook`,
      secret_token: await hookSecret(),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    if (me?.ok && me.result?.username) {
      await supabase.from('market_cache').upsert({ cache_key: 'telegram_bot_info',
        data: { username: me.result.username }, updated_at: new Date().toISOString() }, { onConflict: 'cache_key' });
    }
    return json({ ok: !!(me?.ok && hook?.ok), username: me?.result?.username || null, webhook: hook?.description || hook?.ok });
  }

  /* ── Updates from Telegram ── */
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await hookSecret()) return json({ error: 'forbidden' }, 403);
  let update: any;
  try { update = await req.json(); } catch { return json({ ok: true }); }
  const msg = update?.message;
  if (!msg || msg.chat?.type !== 'private' || typeof msg.text !== 'string') return json({ ok: true });
  const chat = Number(msg.chat.id);
  const text = msg.text.trim();
  /* Language: the subscriber's site language when we know it, the link
     code's when linking, and Telegram's own language_code otherwise. */
  const { data: known } = await supabase.from('telegram_subscribers').select('lang').eq('chat_id', chat).maybeSingle();
  let lang: Lang = known?.lang === 'mk' ? 'mk' : known?.lang === 'en' ? 'en'
    : (String(msg.from?.language_code || '').startsWith('mk') ? 'mk' : 'en');

  try {
    if (/^\/start\b/.test(text)) {
      const code = text.split(/\s+/)[1] || '';
      if (!/^r[0-9a-f]{15}$/.test(code)) { await reply(chat, T[lang].hello); return json({ ok: true }); }
      const { data: row } = await supabase.from('telegram_link_codes').select('rot_uid,created_at,lang').eq('code', code).maybeSingle();
      await supabase.from('telegram_link_codes').delete().eq('code', code);
      if (row?.lang === 'mk' || row?.lang === 'en') lang = row.lang;
      if (!row || Date.now() - Date.parse(row.created_at) > 30 * 60000) { await reply(chat, T[lang].expired); return json({ ok: true }); }
      if (!(await isPro(row.rot_uid))) { await reply(chat, T[lang].notPro); return json({ ok: true }); }
      /* One chat per browser and one browser per chat: a chat linked
         before to another browser moves to this one. */
      await supabase.from('telegram_subscribers').delete().eq('chat_id', chat).neq('rot_uid', row.rot_uid);
      const { error } = await supabase.from('telegram_subscribers').upsert(
        { rot_uid: row.rot_uid, chat_id: chat, active: true, lang, linked_at: new Date().toISOString() }, { onConflict: 'rot_uid' });
      if (error) throw new Error(error.message);
      await reply(chat, T[lang].connected);
      return json({ ok: true });
    }

    if (/^\/stop\b/.test(text)) {
      await supabase.from('telegram_subscribers').update({ active: false }).eq('chat_id', chat);
      await reply(chat, T[lang].stopped);
      return json({ ok: true });
    }

    if (/^\/status\b/.test(text)) {
      const { data: s } = await supabase.from('telegram_subscribers').select('active,coins,last_dm_at').eq('chat_id', chat).maybeSingle();
      const n = Array.isArray(s?.coins) ? s.coins.length : 0;
      await reply(chat, s && s.active ? T[lang].statusOn(n, s.last_dm_at ? String(s.last_dm_at).slice(0, 10) : '') : T[lang].statusOff);
      return json({ ok: true });
    }

    await reply(chat, T[lang].help);
  } catch (e) {
    console.error('[telegram-webhook]', e instanceof Error ? e.message : String(e));
  }
  return json({ ok: true });   // always 200 to Telegram, so it does not retry
});
