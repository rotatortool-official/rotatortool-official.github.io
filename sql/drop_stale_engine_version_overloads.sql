-- ============================================================
-- drop_stale_engine_version_overloads.sql
--
-- Follow-up to add_engine_version_to_snapshots.sql. That migration
-- added new (..., p_engine_version) overloads of record_daily_snapshot,
-- record_momentum_snapshot, and record_holdings_snapshot but left the
-- old pre-engine_version overloads in place — the exact ambiguous-
-- overload shape add_source_and_restore_mcap_signal_snapshots.sql
-- warned about and cleaned up for record_daily_snapshot's PREVIOUS
-- overload. Verified live (2026-09-05) that every current caller sends
-- p_engine_version so PostgREST was already resolving to the new
-- overload correctly — this migration is hygiene, not a bug fix.
--
-- Drops:
--   record_daily_snapshot(jsonb, text)       -- superseded by (jsonb, text, text)
--   record_momentum_snapshot(jsonb)          -- superseded by (jsonb, text)
--   record_holdings_snapshot(jsonb)          -- superseded by (jsonb, text)
-- ============================================================

drop function if exists record_daily_snapshot(jsonb, text);
drop function if exists record_momentum_snapshot(jsonb);
drop function if exists record_holdings_snapshot(jsonb);
