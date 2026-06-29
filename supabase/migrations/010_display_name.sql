-- 010_display_name.sql
-- Adds display_name to public.users and the UPDATE RLS policy required to write it.
--
-- Constraint: NULL is allowed (not yet set); non-null values must be 1–50 chars after
-- trimming. Rejects empty string and whitespace-only at the DB layer, consistent with
-- the PUT /api/account handler's empty→null rule.

ALTER TABLE public.users
  ADD COLUMN display_name TEXT
    CHECK (display_name IS NULL OR char_length(trim(display_name)) BETWEEN 1 AND 50);

-- USING: gates which rows the user can target (own row only).
-- WITH CHECK: prevents reassigning user_id to another user's UUID after update.
-- Both clauses required per RLS update policy contract (see CLAUDE.md).
DROP POLICY IF EXISTS "Users update own row" ON public.users;
CREATE POLICY "Users update own row" ON public.users
  FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
