-- 008_stripe_events_processed.sql
-- Webhook idempotency ledger. Service-role writes only. RLS intentionally off.

CREATE TABLE IF NOT EXISTS public.stripe_events_processed (
  event_id     TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.stripe_events_processed IS
  'Webhook idempotency ledger. Service-role writes only. RLS intentionally off.';
