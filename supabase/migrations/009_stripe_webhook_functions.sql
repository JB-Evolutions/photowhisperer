-- 009_stripe_webhook_functions.sql
-- Per implementation-guide.md Pack 5 Step 6.
-- Both functions are called only by the webhook's service-role client.

-- claim_stripe_event: atomic idempotency claim. Returns TRUE only when this
-- call newly inserted the row (i.e. the event has not been processed before).
-- Returns FALSE on conflict (already processed) rather than relying on the
-- caller to infer that from an empty result set.
CREATE OR REPLACE FUNCTION public.claim_stripe_event(p_event_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  INSERT INTO public.stripe_events_processed (event_id)
  VALUES (p_event_id)
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_stripe_event(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stripe_event(TEXT) TO service_role;

-- grant_credits: atomic credit grant. credits_remaining/total_purchased must
-- be incremented relative to their current value on conflict, which
-- supabase-js's upsert() cannot express (it only writes literal values).
CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id UUID,
  p_amount  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.credit_balances (user_id, credits_remaining, total_purchased, last_purchased_at)
  VALUES (p_user_id, p_amount, p_amount, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    credits_remaining = credit_balances.credits_remaining + p_amount,
    total_purchased   = credit_balances.total_purchased + p_amount,
    last_purchased_at = NOW(),
    updated_at        = NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, INT) TO service_role;
