-- 007_quota_with_credits.sql
-- Per arch-spec-v3.1.md §2.8
-- Atomic quota check + increment, consuming extra credits when tier exhausted.

-- Drop any prior versions cleanly
DROP FUNCTION IF EXISTS public.check_and_increment_quota(UUID, INT, INT, INT);
DROP FUNCTION IF EXISTS public.check_and_increment_quota_with_credits(UUID, INT, INT, INT);

CREATE OR REPLACE FUNCTION public.check_and_increment_quota_with_credits(
  p_user_id   UUID,
  p_month     INT,
  p_year      INT,
  p_tier_limit INT
)
RETURNS TABLE(success BOOLEAN, monthly_count INT, credits_used BOOLEAN, credits_remaining INT)
AS $$
DECLARE
  v_count   INT;
  v_credits INT;
BEGIN
  -- Ensure usage_tracking row exists
  INSERT INTO public.usage_tracking (user_id, month, year, request_count)
  VALUES (p_user_id, p_month, p_year, 0)
  ON CONFLICT (user_id, month, year) DO NOTHING;

  -- Lock the usage row
  SELECT request_count INTO v_count
  FROM public.usage_tracking
  WHERE user_id = p_user_id AND month = p_month AND year = p_year
  FOR UPDATE;

  -- Unlimited (reserved; no production tier uses this in v1): always increment, no credits consumed
  IF p_tier_limit = -1 THEN
    UPDATE public.usage_tracking
    SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT cb.credits_remaining INTO v_credits
    FROM public.credit_balances cb WHERE cb.user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + 1, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  -- Within tier limit: increment monthly count, no credits consumed
  IF v_count < p_tier_limit THEN
    UPDATE public.usage_tracking
    SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT cb.credits_remaining INTO v_credits
    FROM public.credit_balances cb WHERE cb.user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + 1, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  -- Over tier limit: try to consume one extra credit
  SELECT cb.credits_remaining INTO v_credits
  FROM public.credit_balances cb WHERE cb.user_id = p_user_id FOR UPDATE;

  IF COALESCE(v_credits, 0) > 0 THEN
    UPDATE public.credit_balances
    SET credits_remaining = v_credits - 1, updated_at = NOW()
    WHERE user_id = p_user_id;
    -- Still increment monthly count for accurate reporting
    UPDATE public.usage_tracking
    SET request_count = v_count + 1, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;
    RETURN QUERY SELECT TRUE, v_count + 1, TRUE, v_credits - 1;
    RETURN;
  END IF;

  -- Hard out: no monthly capacity, no extra credits
  RETURN QUERY SELECT FALSE, v_count, FALSE, COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql;
