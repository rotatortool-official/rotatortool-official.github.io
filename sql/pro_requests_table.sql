-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the pro_requests table for donation-to-Pro activation pipeline

CREATE TABLE IF NOT EXISTS pro_requests (
  id          BIGSERIAL PRIMARY KEY,
  rot_uid     TEXT NOT NULL,
  amount      TEXT,                          -- e.g. "$20", "20 USDT"
  network     TEXT,                          -- e.g. "TRC20", "BEP20", "Binance Pay"
  tx_hash     TEXT,                          -- transaction hash or Binance Pay ref
  contact     TEXT,                          -- Telegram/Discord/Email so you can reach them
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT                           -- admin notes (optional)
);

-- Allow anonymous inserts (users submit requests) and reads (check own status)
ALTER TABLE pro_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a request"
  ON pro_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read own requests"
  ON pro_requests FOR SELECT
  USING (true);

-- You (admin) update status via Supabase dashboard — no policy needed for dashboard access

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pro_requests_status
  ON pro_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pro_requests_uid
  ON pro_requests (rot_uid);
