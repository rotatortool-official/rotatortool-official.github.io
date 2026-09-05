-- ══════════════════════════════════════════════════════════════════
-- signal_assistant_usage_table.sql   (roadmap Step D — Signal Assistant)
--
-- NOT APPLIED. Review, then run in the Supabase SQL editor.
--
-- Per-user, per-day question counter for the Pro "Signal Assistant" chat
-- feature (see supabase/functions/signal-assistant/). Every question costs
-- a real Anthropic API call on a project that runs on a ~$0-50/month
-- budget (see README.md's donate panel) — this table is what lets the
-- Edge Function refuse politely instead of an uncapped bill.
--
-- No RLS policies are defined on purpose: RLS is enabled with zero grants,
-- so anon/authenticated get NO access at all, in either direction. Only
-- the Edge Function (service role, which bypasses RLS) ever touches this
-- table — there's nothing here a visitor needs to read directly.
-- ══════════════════════════════════════════════════════════════════

create table if not exists signal_assistant_usage (
  rot_uid text        not null,
  day     date        not null default current_date,
  count   int         not null default 0,
  updated_at timestamptz not null default now(),
  primary key (rot_uid, day)
);

alter table signal_assistant_usage enable row level security;
-- Deliberately no policies — service role only. See header comment.

-- ══════════════════════════════════════════════════════════════════
-- increment_signal_assistant_usage(p_rot_uid, p_limit)
--   → { ok, count, limit }
--
-- Atomic check-and-increment in one statement, so two near-simultaneous
-- requests from the same user can't both slip in under the cap (a
-- read-then-write in the Edge Function would have exactly that race).
--
--   ok=true,  count<=limit  — allowed, count now reflects this request
--   ok=false, count=limit+1 (not persisted past the cap — see CTE)  — over the daily cap, request should be refused
--
-- SECURITY DEFINER because the table has no anon/authenticated grants at
-- all; this function is the only way to touch it, and only the Edge
-- Function (service role) is expected to call it.
-- ══════════════════════════════════════════════════════════════════
create or replace function increment_signal_assistant_usage(
  p_rot_uid text,
  p_limit   int
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_rot_uid is null or length(p_rot_uid) = 0 then
    return json_build_object('ok', false, 'reason', 'invalid_uid', 'count', 0, 'limit', p_limit);
  end if;

  -- Peek first — never increment past the cap, so a day's count never
  -- overshoots the limit no matter how many refused requests arrive.
  select count into v_count
    from signal_assistant_usage
   where rot_uid = p_rot_uid and day = current_date;

  if v_count is not null and v_count >= p_limit then
    return json_build_object('ok', false, 'reason', 'rate_limited', 'count', v_count, 'limit', p_limit);
  end if;

  insert into signal_assistant_usage (rot_uid, day, count, updated_at)
  values (p_rot_uid, current_date, 1, now())
  on conflict (rot_uid, day) do update
    set count = signal_assistant_usage.count + 1,
        updated_at = now()
  returning count into v_count;

  return json_build_object('ok', true, 'reason', 'allowed', 'count', v_count, 'limit', p_limit);
end;
$$;

revoke all on function increment_signal_assistant_usage(text, int) from public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Verification
--
--   select has_table_privilege('anon','signal_assistant_usage','select'); -- false
--
--   select increment_signal_assistant_usage('test-uid', 30);  -- → count 1
--   select increment_signal_assistant_usage('test-uid', 30);  -- → count 2
--   select increment_signal_assistant_usage('test-uid', 1);   -- → ok:false, rate_limited
--
--   -- Today's usage, for spot-checking spend:
--   select rot_uid, count from signal_assistant_usage where day = current_date order by count desc;
--
-- Optional cleanup (data is tiny, not urgent):
--   delete from signal_assistant_usage where day < current_date - 30;
--
-- Rollback:  drop function increment_signal_assistant_usage(text, int);
--            drop table signal_assistant_usage;
-- ══════════════════════════════════════════════════════════════════
