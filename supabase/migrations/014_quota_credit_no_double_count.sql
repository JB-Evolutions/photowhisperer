-- 014_quota_credit_no_double_count.sql
-- QA finding: the credit-funded branch of check_and_increment_quota_with_credits
-- (007) incremented usage_tracking.request_count on every credit-funded request,
-- letting it climb past p_tier_limit. Every display consumer (Sidebar.tsx,
-- BillingView.tsx, AppShell.tsx's soft-warning/outOfCredits gates) assumes
-- monthly_used never exceeds monthly_limit. Fix: credits_remaining still
-- decrements exactly as before; request_count no longer moves once the tier
-- limit is reached. The -1 (unlimited) branch and the within-limit branch are
-- untouched.

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
    RETURN QUERY SELECT TRUE, v_count, TRUE, v_credits - 1;
    RETURN;
  END IF;

  -- Hard out: no monthly capacity, no extra credits
  RETURN QUERY SELECT FALSE, v_count, FALSE, COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql;

-- One-time data repair: the pre-existing credit-funded branch let
-- request_count climb past the tier limit. Cap any row still over its
-- tier's limit back down to that limit. Confirmed via read-only audit
-- (2026-07-24): exactly 1 row affected (user e34db8dc-7e28-4591-9dcc-
-- fb08dd8243be, month 7/2026, request_count 8, snapshot limit 5).
-- Tier->limit mapping mirrors TIER_LIMITS in src/lib/quota.ts; unmapped
-- or null tier defaults to snapshot, matching getTierLimit()'s fallback.
UPDATE public.usage_tracking ut
SET request_count = capped.tier_limit
FROM (
  SELECT
    u.user_id,
    u.month,
    u.year,
    CASE COALESCE(s.tier, 'snapshot')
      WHEN 'snapshot' THEN 5
      WHEN 'portrait' THEN 500
      WHEN 'studio'   THEN 2000
      ELSE 5
    END AS tier_limit
  FROM public.usage_tracking u
  LEFT JOIN public.subscriptions s ON s.user_id = u.user_id
) AS capped
WHERE ut.user_id = capped.user_id
  AND ut.month = capped.month
  AND ut.year = capped.year
  AND ut.request_count > capped.tier_limit;
