// ============================================================
// signal-assistant — Supabase Edge Function
//
// Roadmap Step D (promptove/07-roadmap-2026-09-05.md, promptove Task 5).
// Pro-only chat feature: answers questions about the current rotation
// signals using ONLY the live signal_runs/signal_run_items data (the
// same server-authoritative table the site and the Telegram bot read —
// see Step B/C). The system prompt below is promptove/signal-assistant.md
// verbatim — kept here as a constant rather than fetched at request time,
// since it changes rarely and this keeps the request's cached prefix
// stable (see the cache_control note below).
//
// CALLED DIRECTLY FROM THE BROWSER (unlike the cron-triggered sync-*
// functions), so this deploys with verify_jwt=true — the client always
// sends the anon key as its Authorization bearer, which IS a valid
// Supabase-signed JWT and satisfies that gate. Pro access itself is a
// SEPARATE check done here against `pro_users`, the same table + same
// query shape js/supabase.js's supaCheckPro() already uses client-side —
// this function re-checks server-side because a client-side `isPro` flag
// is trivially spoofable and this endpoint costs real money per call.
//
// COST CONTROL: this project runs on a ~$0-50/month budget (see the
// site's own donate panel). Two guards, both required:
//   1. Pro-only (checked here, not just trusted from the client).
//   2. A daily per-user cap via increment_signal_assistant_usage() —
//      see sql/signal_assistant_usage_table.sql. Model is Sonnet 5
//      (not Opus) for the same reason — this is short, structured Q&A
//      over a fixed data snapshot, not open-ended reasoning.
//
// WHAT IT DOES NOT DO: no chat history is stored server-side — the
// client resends the conversation each turn (capped to the last few
// turns here, see MAX_HISTORY_MESSAGES). No technical-indicator layer,
// no category-peer grouping (v2's relBtc / the engine's technical layer
// aren't in the data sent here) — a real, documented gap, not a silent
// one; the assistant can still answer relative-strength/rotation
// questions from score/zone/p7/p14/p30 alone.
//
// DEPLOY:
//   supabase functions deploy signal-assistant
//   supabase secrets set ANTHROPIC_API_KEY=<your Anthropic API key>
//
// SCHEMA: sql/signal_assistant_usage_table.sql must be applied first.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODEL = 'claude-sonnet-5';
const MAX_QUESTIONS_PER_DAY = 30;
const MAX_HISTORY_MESSAGES = 8;      // last N messages (user+assistant), oldest dropped
const MAX_QUESTION_CHARS = 1000;
const DISCLAIMER = 'Algorithmic rotation signal only · Not financial advice · DYOR.';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Verbatim from promptove/signal-assistant.md — keep both in sync by hand;
// it's short and changes rarely, not worth a build step to generate it.
const SYSTEM_PROMPT = `You are the Rotator Signal Assistant on rotatortool-official.github.io.

Your job is to help Pro users understand what the current Rotator model sees. You answer questions about relative strength, relative weakness, and rotation setups using only the live signal data provided to you.

## Core rules

- A low score = relative weakness (not automatically "buy").
- A high score = relative strength (not automatically "sell").
- Only call something a "rotation setup" or "swap" if the canonical engine explicitly qualified that pair.
- Never invent scores, prices, indicators, or pairs.
- Never give personalized financial instructions ("you should buy X").
- Always respect the current BTC regime and data timestamp supplied with the signal run.
- Always end with exactly: Algorithmic rotation signal only · Not financial advice · DYOR.

## How to answer common questions

**"What looks weak / potential rotation targets?"**
Show the current qualified rotate-in candidates with score, recent performance, and short reason.

**"What looks strong / extended?"**
Show the current relative-strength / potential rotate-out candidates.

**"I hold FIL (or any coin) — how has it done?"**
Compare its score and 7D/14D/30D performance against BTC and current rotation candidates. (Category-peer data is not provided in this data set — say so rather than guessing peers.)

**"Should I rotate A into B?"**
Only say it is a valid setup if the engine classified it that way. Otherwise state that the current model does not qualify the pair. Show both scores and the gap.

**"What's the market regime?"**
State the supplied BTC regime and how it affects interpretation of signals.

## Tone and format

- Calm, precise, research-style.
- Prefer short bullets or compact tables.
- Mention signal run timestamp and algorithm version when useful.
- If data is missing or stale, say so clearly.
- Do not dump the whole market unless asked.
- If a coin the user asks about is not in the provided data, say it isn't currently tracked rather than guessing.

## Language to prefer
- "potential rotation target"
- "relative weakness"
- "relative strength"
- "qualified rotation-in candidate"
- "the model currently shows"

## Language to avoid
- guaranteed, will pump, easy money, 100% buy, moon, sure winner, safe trade, you should buy/sell`;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { rot_uid?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const rotUid = (body.rot_uid || '').trim();
  const clientMessages = Array.isArray(body.messages) ? body.messages : [];
  if (!rotUid) return json({ error: 'missing_rot_uid' }, 400);
  if (!clientMessages.length) return json({ error: 'missing_messages' }, 400);
  const last = clientMessages[clientMessages.length - 1];
  if (last.role !== 'user') return json({ error: 'last_message_must_be_user' }, 400);
  if (last.content.length > MAX_QUESTION_CHARS) {
    return json({ error: 'question_too_long', limit: MAX_QUESTION_CHARS }, 400);
  }

  try {
    // ── 1. Pro gate — same table/query js/supabase.js's supaCheckPro()
    //    uses client-side, re-checked server-side since this costs money. ──
    const { data: proRows, error: proErr } = await supabase
      .from('pro_users')
      .select('rot_uid')
      .eq('rot_uid', rotUid)
      .eq('is_pro', true)
      .limit(1);
    if (proErr) throw new Error('pro check failed: ' + proErr.message);
    if (!proRows || !proRows.length) return json({ error: 'not_pro' }, 403);

    // ── 2. Daily rate limit — atomic, see sql/signal_assistant_usage_table.sql ──
    const { data: usage, error: usageErr } = await supabase.rpc('increment_signal_assistant_usage', {
      p_rot_uid: rotUid,
      p_limit: MAX_QUESTIONS_PER_DAY,
    });
    if (usageErr) throw new Error('usage check failed: ' + usageErr.message);
    if (!usage?.ok) {
      return json({ error: 'rate_limited', limit: MAX_QUESTIONS_PER_DAY, count: usage?.count ?? null }, 429);
    }

    // ── 3. Latest signal run — the ONLY data source the assistant sees ──
    const { data: runRows, error: runErr } = await supabase
      .from('signal_runs')
      .select('id, as_of, engine_version, cycle_label, universe_size, eligible_count')
      .order('as_of', { ascending: false })
      .limit(1);
    if (runErr) throw new Error('signal_runs read failed: ' + runErr.message);
    const run = runRows?.[0];
    if (!run) return json({ error: 'no_signal_run' }, 503);

    const { data: items, error: itemsErr } = await supabase
      .from('signal_run_items')
      .select('coin_sym, score, zone, eligible, data_complete, p7, p14, p30, setup')
      .eq('run_id', run.id);
    if (itemsErr) throw new Error('signal_run_items read failed: ' + itemsErr.message);

    const dataSnapshot = {
      as_of: run.as_of,
      engine_version: run.engine_version,
      cycle_label: run.cycle_label,
      universe_size: run.universe_size,
      eligible_count: run.eligible_count,
      coins: (items || [])
        .filter((it) => it.data_complete !== false)
        .map((it) => ({
          sym: it.coin_sym,
          score: it.score,
          zone: it.zone,
          eligible: it.eligible,
          p7: it.p7, p14: it.p14, p30: it.p30,
          setup: it.setup,
        })),
    };

    // ── 4. Build the request. Stable rules first (cacheable), volatile
    //    data snapshot after — a byte change in the snapshot can't
    //    invalidate the cached rules block since it comes later in the
    //    prefix. ──
    const history = clientMessages.slice(-MAX_HISTORY_MESSAGES);
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'Current signal run data (JSON):\n' + JSON.stringify(dataSnapshot) },
      ],
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    let reply = textBlock?.text?.trim() || "I couldn't produce an answer from the current signal data.";

    // Defense-in-depth: the system prompt requires this exact line, but
    // never trust a model output to enforce its own compliance footer.
    if (!reply.endsWith(DISCLAIMER)) reply = reply + '\n\n' + DISCLAIMER;

    return json({ reply, as_of: run.as_of, engine_version: run.engine_version });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[signal-assistant] failed:', msg);
    return json({ error: 'internal_error' }, 500);
  }
});
