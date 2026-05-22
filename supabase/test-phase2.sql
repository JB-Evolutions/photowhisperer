-- =============================================================================
-- test-phase2.sql — Phase 2 database schema verification
-- =============================================================================
--
-- BEFORE RUNNING:
--   1. In Supabase dashboard: Authentication → Users → Add user.
--      Enter an email and password. Check "Auto Confirm User". Click "Create user".
--   2. Copy the UUID from the dashboard (shown in the Users list).
--   3. Replace <<REPLACE_WITH_TEST_USER_ID>> below with that UUID.
--   4. Paste the entire script into the Supabase SQL Editor and click Run.
--
-- AFTER TESTS PASS:
--   Delete the test user via Supabase dashboard: Authentication → Users →
--   find the test user → Delete. The auth.users ON DELETE CASCADE propagates
--   through public.users and all dependent tables automatically.
--   Do NOT run the DELETE in SQL directly — use the dashboard.
-- =============================================================================

DO $$
DECLARE
  v_test_user_id UUID    := '<<REPLACE_WITH_TEST_USER_ID>>';
  v_month        INT     := EXTRACT(MONTH FROM CURRENT_DATE)::INT;
  v_year         INT     := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  v_success      BOOLEAN;
  v_count        INT;
  v_used         BOOLEAN;
  v_credits      INT;
  v_iter         INT;
BEGIN

  -- =========================================================================
  -- SECTION 0 — Reset state (idempotent: safe to re-run)
  -- =========================================================================
  DELETE FROM public.usage_tracking
    WHERE user_id = v_test_user_id
      AND month = v_month
      AND year = v_year;

  UPDATE public.credit_balances
    SET credits_remaining = 0
    WHERE user_id = v_test_user_id;

  RAISE NOTICE 'State reset for user %', v_test_user_id;

  -- =========================================================================
  -- SECTION 1 — Verify signup trigger populated all three tables
  -- =========================================================================
  IF (SELECT COUNT(*) FROM public.users WHERE user_id = v_test_user_id) != 1 THEN
    RAISE EXCEPTION 'Section 1 FAILED: expected 1 row in public.users for %, got %',
      v_test_user_id,
      (SELECT COUNT(*) FROM public.users WHERE user_id = v_test_user_id);
  END IF;

  IF (SELECT COUNT(*) FROM public.subscriptions
        WHERE user_id = v_test_user_id AND tier = 'snapshot') != 1 THEN
    RAISE EXCEPTION 'Section 1 FAILED: expected 1 row in public.subscriptions with tier=snapshot for %, got %',
      v_test_user_id,
      (SELECT COUNT(*) FROM public.subscriptions WHERE user_id = v_test_user_id);
  END IF;

  IF (SELECT COUNT(*) FROM public.credit_balances
        WHERE user_id = v_test_user_id AND credits_remaining = 0) != 1 THEN
    RAISE EXCEPTION 'Section 1 FAILED: expected 1 row in public.credit_balances with credits_remaining=0 for %, got %',
      v_test_user_id,
      (SELECT COUNT(*) FROM public.credit_balances WHERE user_id = v_test_user_id);
  END IF;

  RAISE NOTICE 'Section 1 PASSED: signup trigger created all 3 rows correctly';

  -- =========================================================================
  -- SECTION 2 — Five calls under tier limit (limit=5)
  -- =========================================================================
  FOR v_iter IN 1..5 LOOP
    SELECT success, monthly_count, credits_used, credits_remaining
      INTO v_success, v_count, v_used, v_credits
      FROM public.check_and_increment_quota_with_credits(v_test_user_id, v_month, v_year, 5);

    RAISE NOTICE 'Section 2 call %: success=%, count=%, credits_used=%, credits_remaining=%',
      v_iter, v_success, v_count, v_used, v_credits;

    IF v_success IS NOT TRUE THEN
      RAISE EXCEPTION 'Section 2 FAILED at iteration %: expected success=true, got %', v_iter, v_success;
    END IF;
    IF v_count != v_iter THEN
      RAISE EXCEPTION 'Section 2 FAILED at iteration %: expected monthly_count=%, got %', v_iter, v_iter, v_count;
    END IF;
    IF v_used IS NOT FALSE THEN
      RAISE EXCEPTION 'Section 2 FAILED at iteration %: expected credits_used=false, got %', v_iter, v_used;
    END IF;
    IF v_credits != 0 THEN
      RAISE EXCEPTION 'Section 2 FAILED at iteration %: expected credits_remaining=0, got %', v_iter, v_credits;
    END IF;
  END LOOP;

  RAISE NOTICE 'Section 2 PASSED: 5 calls under tier limit all returned success=true, credits_used=false';

  -- =========================================================================
  -- SECTION 3 — Sixth call should fail (tier exhausted, no credits)
  -- =========================================================================
  SELECT success, monthly_count, credits_used, credits_remaining
    INTO v_success, v_count, v_used, v_credits
    FROM public.check_and_increment_quota_with_credits(v_test_user_id, v_month, v_year, 5);

  RAISE NOTICE 'Section 3 call 6: success=%, count=%, credits_used=%, credits_remaining=%',
    v_success, v_count, v_used, v_credits;

  IF v_success IS NOT FALSE THEN
    RAISE EXCEPTION 'Section 3 FAILED: expected success=false on 6th call, got %', v_success;
  END IF;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'Section 3 FAILED: expected monthly_count=5, got %', v_count;
  END IF;
  IF v_used IS NOT FALSE THEN
    RAISE EXCEPTION 'Section 3 FAILED: expected credits_used=false, got %', v_used;
  END IF;
  IF v_credits != 0 THEN
    RAISE EXCEPTION 'Section 3 FAILED: expected credits_remaining=0, got %', v_credits;
  END IF;

  RAISE NOTICE 'Section 3 PASSED: 6th call correctly rejected (no tier capacity, no credits)';

  -- =========================================================================
  -- SECTION 4 — Grant 5 extra credits
  -- =========================================================================
  UPDATE public.credit_balances
    SET credits_remaining = 5
    WHERE user_id = v_test_user_id;

  RAISE NOTICE 'Section 4: granted 5 credits to user %', v_test_user_id;

  -- =========================================================================
  -- SECTION 5 — Five more calls, each consuming one credit
  -- =========================================================================
  FOR v_iter IN 1..5 LOOP
    SELECT success, monthly_count, credits_used, credits_remaining
      INTO v_success, v_count, v_used, v_credits
      FROM public.check_and_increment_quota_with_credits(v_test_user_id, v_month, v_year, 5);

    RAISE NOTICE 'Section 5 call % (overall call %): success=%, count=%, credits_used=%, credits_remaining=%',
      v_iter, 5 + v_iter, v_success, v_count, v_used, v_credits;

    IF v_success IS NOT TRUE THEN
      RAISE EXCEPTION 'Section 5 FAILED at iteration %: expected success=true, got %', v_iter, v_success;
    END IF;
    IF v_count != 5 + v_iter THEN
      RAISE EXCEPTION 'Section 5 FAILED at iteration %: expected monthly_count=%, got %', v_iter, 5 + v_iter, v_count;
    END IF;
    IF v_used IS NOT TRUE THEN
      RAISE EXCEPTION 'Section 5 FAILED at iteration %: expected credits_used=true, got %', v_iter, v_used;
    END IF;
    IF v_credits != 5 - v_iter THEN
      RAISE EXCEPTION 'Section 5 FAILED at iteration %: expected credits_remaining=%, got %', v_iter, 5 - v_iter, v_credits;
    END IF;
  END LOOP;

  RAISE NOTICE 'Section 5 PASSED: 5 credit-consuming calls all returned success=true, credits_used=true, credits counted down 4..0';

  -- =========================================================================
  -- SECTION 6 — Eleventh call should fail (credits exhausted)
  -- =========================================================================
  SELECT success, monthly_count, credits_used, credits_remaining
    INTO v_success, v_count, v_used, v_credits
    FROM public.check_and_increment_quota_with_credits(v_test_user_id, v_month, v_year, 5);

  RAISE NOTICE 'Section 6 call 11: success=%, count=%, credits_used=%, credits_remaining=%',
    v_success, v_count, v_used, v_credits;

  IF v_success IS NOT FALSE THEN
    RAISE EXCEPTION 'Section 6 FAILED: expected success=false on 11th call, got %', v_success;
  END IF;
  IF v_count != 10 THEN
    RAISE EXCEPTION 'Section 6 FAILED: expected monthly_count=10, got %', v_count;
  END IF;
  IF v_used IS NOT FALSE THEN
    RAISE EXCEPTION 'Section 6 FAILED: expected credits_used=false, got %', v_used;
  END IF;
  IF v_credits != 0 THEN
    RAISE EXCEPTION 'Section 6 FAILED: expected credits_remaining=0, got %', v_credits;
  END IF;

  RAISE NOTICE 'Section 6 PASSED: 11th call correctly rejected (tier exhausted, credits exhausted)';

  -- =========================================================================
  RAISE NOTICE 'ALL PHASE 2 TESTS PASSED';
  -- =========================================================================

END $$;

-- =============================================================================
-- MANUAL CLEANUP (run after confirming tests passed):
--   1. In Supabase dashboard: Authentication → Users → find the test user → Delete.
--   2. The auth.users ON DELETE CASCADE propagates through public.users (FK in 001)
--      and all dependent tables (subscriptions, credit_balances, usage_tracking,
--      camera_profiles, sessions, session_messages) automatically.
-- =============================================================================
