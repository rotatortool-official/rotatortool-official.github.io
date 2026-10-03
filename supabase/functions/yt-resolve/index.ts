// yt-resolve — turns a pasted YouTube link into something the radio
// player can embed (site js/radio.js, "Add your own", 2026-10-03).
//
// Request:  POST { url }   (anon key as bearer, like verify-tx)
// Response: { ok: true, kind: 'video' | 'playlist' | 'channel',
//             embed: { type: 'video' | 'list', id }, title }
//        or { ok: false, reason }
//
// Why a server: a channel link (@name, /c/, /user/) has to be turned into
// the channel's id, and only YouTube's page says which; browsers cannot
// read that page (CORS). A channel plays as its UPLOADS playlist: the
// channel id with "UC" swapped for "UU", newest first, so a coin's
// podcast channel plays its latest episode.
//
// Only youtube.com / youtu.be links are fetched, so this is not an open
// proxy. Nothing is stored and the link is never logged.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (reason: string) => json({ ok: false, reason });

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[\w-]{11}$/;
const LIST_ID = /^[\w-]{10,64}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function oembedTitle(pageUrl: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(pageUrl));
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.title === 'string' ? d.title : null;
  } catch { return null; }
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function resolveChannel(pageUrl: string): Promise<{ id: string; title: string } | null> {
  const r = await fetch(pageUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, 'Accept-Language': 'en', 'Cookie': 'SOCS=CAI; CONSENT=YES+1' },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
         || html.match(/"externalId":"(UC[\w-]{22})"/)
         || html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/);
  if (!m) return null;
  const t = html.match(/<meta property="og:title" content="([^"]*)"/);
  return { id: m[1], title: t ? decodeEntities(t[1]) : 'YouTube channel' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('POST only.');

  let raw = '';
  try { raw = String((await req.json()).url || '').trim(); } catch { return fail('Send { url }.'); }
  if (!raw || raw.length > 300) return fail('Paste a YouTube link.');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

  let u: URL;
  try { u = new URL(raw); } catch { return fail('That is not a link.'); }
  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) return fail('Only YouTube links can be added.');

  const parts = u.pathname.split('/').filter(Boolean);
  const list = u.searchParams.get('list');
  let video: string | null = null;
  if (host === 'youtu.be') video = parts[0] || null;
  else if (parts[0] === 'watch') video = u.searchParams.get('v');
  else if (['live', 'shorts', 'embed', 'v'].includes(parts[0])) video = parts[1] || null;

  try {
    // A playlist link (also a video inside a playlist): play the list.
    if (list && LIST_ID.test(list) && !list.startsWith('RD')) {
      const title = await oembedTitle('https://www.youtube.com/playlist?list=' + list);
      if (!title) return fail('That playlist is private or does not exist.');
      return json({ ok: true, kind: 'playlist', embed: { type: 'list', id: list }, title });
    }
    if (video) {
      if (!VIDEO_ID.test(video)) return fail('That video link looks broken.');
      const title = await oembedTitle('https://www.youtube.com/watch?v=' + video);
      if (!title) return fail('That video is private, removed, or cannot be embedded.');
      return json({ ok: true, kind: 'video', embed: { type: 'video', id: video }, title });
    }
    // A channel: /channel/UC..., /@name, /c/name, /user/name
    let ch: { id: string; title: string } | null = null;
    if (parts[0] === 'channel' && parts[1] && CHANNEL_ID.test(parts[1])) {
      ch = await resolveChannel('https://www.youtube.com/channel/' + parts[1]);
      if (!ch) ch = { id: parts[1], title: 'YouTube channel' };
    } else if (parts[0] && (parts[0].startsWith('@') || ['c', 'user'].includes(parts[0]))) {
      const path = parts[0].startsWith('@') ? parts[0] : parts[0] + '/' + (parts[1] || '');
      if (!/^[@\w.\-\/%]{2,120}$/.test(path)) return fail('That channel link looks broken.');
      ch = await resolveChannel('https://www.youtube.com/' + path);
      if (!ch) return fail('Could not find that channel. Check the link and try again.');
    }
    if (ch) {
      return json({ ok: true, kind: 'channel', embed: { type: 'list', id: 'UU' + ch.id.slice(2) }, title: ch.title });
    }
    return fail('Paste a link to a YouTube channel, video or playlist.');
  } catch {
    return fail('YouTube did not answer. Try again in a moment.');
  }
});
