-- 006_credit_balances.sql
-- Per arch-spec-v3.1.md §2.4
-- Also creates the handle_new_user trigger in its final form.

-- ============================================================
-- credit_balances
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_balances (
  user_id           UUID PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  credits_remaining INT NOT NULL DEFAULT 0,
  total_purchased   INT NOT NULL DEFAULT 0,
  last_purchased_at TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT NOW(),
  CHECK (credits_remaining >= 0)
);

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own credits" ON public.credit_balances;
CREATE POLICY "Users view own credits" ON public.credit_balances
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- handle_new_user trigger
-- Inserts rows into users, subscriptions, and credit_balances
-- when a new auth.users row is created.
-- SECURITY DEFINER: runs with owner privileges so the trigger
-- can write to public schema regardless of the inserting role.
-- search_path pinned to prevent search_path hijacking.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (user_id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.subscriptions (user_id, tier) VALUES (NEW.id, 'snapshot');
  INSERT INTO public.credit_balances (user_id, credits_remaining) VALUES (NEW.id, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
