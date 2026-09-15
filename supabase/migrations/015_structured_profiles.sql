-- 015_structured_profiles.sql
-- Structured camera profiles matching LensProfile / BodyProfile in
-- src/lib/contract/types.ts, plus sessions.clarification_used and a units
-- parameter on the quota function (photo requests consume 2).
--
-- Null rule: every new numeric column is nullable with no default. NULL means
-- "unknown" and must never be replaced by a plausible value anywhere in the
-- stack. iso_base (default 100) and iso_mode (default 'auto') are the only
-- defaulted settings, per BodyProfile.
--
-- Legacy columns: camera_profiles.body is kept and is BodyProfile.label.
-- camera_profiles.lenses (TEXT[]) is kept for now because
-- src/lib/camera-profile.ts, /api/account/export and scripts/seed-pitch-data.ts
-- still read/write it. Its contents are backfilled into camera_lenses below;
-- drop the column in a follow-up migration once no code references it.

-- ============================================================
-- Enums
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.iso_mode AS ENUM ('auto', 'locked', 'capped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.lens_confidence AS ENUM ('high', 'low', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- camera_profiles: body settings (BodyProfile)
-- ============================================================
ALTER TABLE public.camera_profiles
  ADD COLUMN IF NOT EXISTS crop_factor NUMERIC(4,2)
    CHECK (crop_factor IS NULL OR crop_factor > 0),
  ADD COLUMN IF NOT EXISTS ibis_stops NUMERIC(3,1)
    CHECK (ibis_stops IS NULL OR ibis_stops >= 0),
  ADD COLUMN IF NOT EXISTS iso_base INTEGER NOT NULL DEFAULT 100
    CHECK (iso_base > 0),
  ADD COLUMN IF NOT EXISTS iso_mode public.iso_mode NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS iso_value INTEGER
    CHECK (iso_value IS NULL OR iso_value > 0),
  ADD COLUMN IF NOT EXISTS iso_max INTEGER
    CHECK (iso_max IS NULL OR iso_max > 0);

ALTER TABLE public.camera_profiles
  DROP CONSTRAINT IF EXISTS camera_profiles_iso_mode_requirements;
ALTER TABLE public.camera_profiles
  ADD CONSTRAINT camera_profiles_iso_mode_requirements CHECK (
    (iso_mode <> 'locked' OR iso_value IS NOT NULL) AND
    (iso_mode <> 'capped' OR iso_max IS NOT NULL)
  );

-- ============================================================
-- camera_lenses: one row per lens (LensProfile)
-- ============================================================
-- updated_at/created_at omitted: the parent camera_profiles.updated_at is
-- the profile's edit timestamp (same reasoning as 011_user_preferences.sql).
CREATE TABLE IF NOT EXISTS public.camera_lenses (
  lens_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL
                 REFERENCES public.camera_profiles(user_id) ON DELETE CASCADE,
  ordinal      INTEGER NOT NULL CHECK (ordinal >= 0),
  label        TEXT NOT NULL,
  focal_min_mm NUMERIC(6,1) CHECK (focal_min_mm IS NULL OR focal_min_mm > 0),
  focal_max_mm NUMERIC(6,1) CHECK (focal_max_mm IS NULL OR focal_max_mm > 0),
  aper_wide    NUMERIC(4,2) CHECK (aper_wide IS NULL OR aper_wide > 0),
  aper_tele    NUMERIC(4,2) CHECK (aper_tele IS NULL OR aper_tele > 0),
  stabilised   BOOLEAN,
  stab_stops   NUMERIC(3,1) CHECK (stab_stops IS NULL OR stab_stops >= 0),
  confidence   public.lens_confidence NOT NULL DEFAULT 'unknown',
  CONSTRAINT camera_lenses_focal_order CHECK (
    focal_min_mm IS NULL OR focal_max_mm IS NULL OR focal_max_mm >= focal_min_mm
  ),
  CONSTRAINT camera_lenses_aperture_order CHECK (
    aper_wide IS NULL OR aper_tele IS NULL OR aper_tele >= aper_wide
  ),
  CONSTRAINT camera_lenses_user_ordinal_key UNIQUE (user_id, ordinal)
);

ALTER TABLE public.camera_lenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own lenses" ON public.camera_lenses;
CREATE POLICY "Users view own lenses" ON public.camera_lenses
  FOR SELECT USING (auth.uid() = user_id);

-- USING: gates which rows the user can target (own rows only).
-- WITH CHECK: prevents reassigning user_id to another user's UUID after update.
DROP POLICY IF EXISTS "Users update own lenses" ON public.camera_lenses;
CREATE POLICY "Users update own lenses" ON public.camera_lenses
  FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own lenses" ON public.camera_lenses;
CREATE POLICY "Users insert own lenses" ON public.camera_lenses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Not present on camera_profiles (a profile row is never deleted by the user),
-- but removing a lens from the list is a normal edit on a child table.
DROP POLICY IF EXISTS "Users delete own lenses" ON public.camera_lenses;
CREATE POLICY "Users delete own lenses" ON public.camera_lenses
  FOR DELETE USING (auth.uid() = user_id);

-- Backfill from the legacy TEXT[] column. Raw strings only: confidence
-- 'unknown' and every numeric NULL. Parsing is the app's job
-- (src/lib/lens/parse.ts), never guessed in SQL. NULL/blank entries skipped;
-- ordinals renumbered contiguously from 0. Idempotent via ON CONFLICT.
INSERT INTO public.camera_lenses (user_id, ordinal, label)
SELECT
  src.user_id,
  (row_number() OVER (PARTITION BY src.user_id ORDER BY src.ord) - 1)::INT,
  src.label
FROM (
  SELECT cp.user_id, l.label, l.ord
  FROM public.camera_profiles cp
  CROSS JOIN LATERAL unnest(cp.lenses) WITH ORDINALITY AS l(label, ord)
  WHERE l.label IS NOT NULL AND btrim(l.label) <> ''
) AS src
ON CONFLICT (user_id, ordinal) DO NOTHING;

-- ============================================================
-- sessions
-- ============================================================
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS clarification_used BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- check_and_increment_quota_with_credits: add p_units (default 1)
-- ============================================================
-- Adding a parameter creates a new overload rather than replacing, and a
-- 4-arg call would then be ambiguous between the two. Drop the 4-arg version
-- first. Existing callers (4 named or positional args) resolve to the new
-- function with p_units = 1 and behave exactly as 014.
--
-- Units are charged monthly capacity first, then credits for the remainder.
-- All-or-nothing: if credits cannot cover the remainder, nothing is consumed
-- and success = FALSE. request_count never exceeds p_tier_limit (014 rule).
DROP FUNCTION IF EXISTS public.check_and_increment_quota_with_credits(UUID, INT, INT, INT);

CREATE OR REPLACE FUNCTION public.check_and_increment_quota_with_credits(
  p_user_id    UUID,
  p_month      INT,
  p_year       INT,
  p_tier_limit INT,
  p_units      INT DEFAULT 1
)
RETURNS TABLE(success BOOLEAN, monthly_count INT, credits_used BOOLEAN, credits_remaining INT)
AS $$
DECLARE
  v_count        INT;
  v_credits      INT;
  v_from_monthly INT;
  v_from_credits INT;
BEGIN
  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'p_units must be a positive integer, got %', p_units;
  END IF;

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
    SET request_count = v_count + p_units, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT cb.credits_remaining INTO v_credits
    FROM public.credit_balances cb WHERE cb.user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + p_units, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  v_from_monthly := GREATEST(LEAST(p_tier_limit - v_count, p_units), 0);
  v_from_credits := p_units - v_from_monthly;

  -- Fully within tier limit: increment monthly count, no credits consumed
  IF v_from_credits = 0 THEN
    UPDATE public.usage_tracking
    SET request_count = v_count + p_units, updated_at = NOW()
    WHERE user_id = p_user_id AND month = p_month AND year = p_year;

    SELECT cb.credits_remaining INTO v_credits
    FROM public.credit_balances cb WHERE cb.user_id = p_user_id;
    RETURN QUERY SELECT TRUE, v_count + p_units, FALSE, COALESCE(v_credits, 0);
    RETURN;
  END IF;

  -- Some or all units exceed the tier limit: cover the remainder with credits
  SELECT cb.credits_remaining INTO v_credits
  FROM public.credit_balances cb WHERE cb.user_id = p_user_id FOR UPDATE;

  IF COALESCE(v_credits, 0) >= v_from_credits THEN
    UPDATE public.credit_balances
    SET credits_remaining = v_credits - v_from_credits, updated_at = NOW()
    WHERE user_id = p_user_id;

    IF v_from_monthly > 0 THEN
      UPDATE public.usage_tracking
      SET request_count = v_count + v_from_monthly, updated_at = NOW()
      WHERE user_id = p_user_id AND month = p_month AND year = p_year;
    END IF;

    RETURN QUERY SELECT TRUE, v_count + v_from_monthly, TRUE, v_credits - v_from_credits;
    RETURN;
  END IF;

  -- Hard out: not enough monthly capacity + credits; nothing consumed
  RETURN QUERY SELECT FALSE, v_count, FALSE, COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql;
