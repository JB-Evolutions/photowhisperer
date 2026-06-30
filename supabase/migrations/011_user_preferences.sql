-- 011_user_preferences.sql
-- Per-user preferences: default focal length + product email opt-in.
-- FK mirrors the existing app-table convention: references public.users(user_id),
-- not auth.users(id) directly (matches camera_profiles, credit_balances, subscriptions).
-- Route upserts on first write — no trigger change needed.
-- updated_at omitted: no other table in the schema trigger-maintains it, so
-- including it here would produce a column that shows insert-time forever.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id                  UUID PRIMARY KEY
                             REFERENCES public.users(user_id) ON DELETE CASCADE,
  default_focal_length_mm  INTEGER
                             CHECK (
                               default_focal_length_mm IS NULL OR
                               default_focal_length_mm BETWEEN 8 AND 1200
                             ),
  product_emails_opt_in    BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own preferences" ON public.user_preferences;
CREATE POLICY "Users view own preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own preferences" ON public.user_preferences;
CREATE POLICY "Users insert own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own preferences" ON public.user_preferences;
CREATE POLICY "Users update own preferences" ON public.user_preferences
  FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
