-- ============================================================
-- track_record_win_rate_query.sql
--
-- Ad-hoc query for Supabase SQL Editor. Approximates win rate from
-- signal_snapshots by comparing each 'bullish' snapshot's price to
-- the nearest snapshot for that coin 7–14 days later.
--
-- NOTE: this is a looser check than what track-record.html actually
-- shows. The site's real accuracy number (SignalHistory.
-- getAccuracyStats() in js/signal-history.js) uses Binance daily
-- kline HIGH/LOW inside the confirm window, not just the next
-- snapshot's closing price — so a signal that spiked +15% mid-window
-- and pulled back before the next snapshot counts as a win there but
-- may not here. Use this for a rough gut-check; use track-record.html
-- for the number you'd actually publish.
-- ============================================================

with dated as (
  select coin_id, coin_sym, signal_type, score, price, snap_date
  from signal_snapshots
  where signal_type = 'bullish'
),
matched as (
  select d.coin_id, d.coin_sym, d.snap_date, d.price as entry_price,
    (
      select s2.price
      from signal_snapshots s2
      where s2.coin_id = d.coin_id
        and s2.snap_date between d.snap_date + 7 and d.snap_date + 14
      order by s2.snap_date asc
      limit 1
    ) as exit_price
  from dated d
)
select
  count(*) filter (where exit_price is not null) as total_confirmed,
  count(*) filter (where exit_price > entry_price) as wins,
  count(*) filter (where exit_price <= entry_price) as losses,
  round(
    100.0 * count(*) filter (where exit_price > entry_price)
    / nullif(count(*) filter (where exit_price is not null), 0), 1
  ) as win_rate_pct
from matched;
