-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the market_cache table for shared API caching

CREATE TABLE IF NOT EXISTS market_cache (
  cache_key   TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow anonymous reads and writes (same as pro_users RLS pattern)
ALTER TABLE market_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache"
  ON market_cache FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert cache"
  ON market_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update cache"
  ON market_cache FOR UPDATE
  USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_market_cache_updated
  ON market_cache (updated_at DESC);

-- Optional: auto-cleanup entries older than 1 hour (run periodically or via pg_cron)
-- DELETE FROM market_cache WHERE updated_at < now() - interval '1 hour';
