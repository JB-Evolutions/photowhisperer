-- 001_initial_schema.sql
-- Tables: users, subscriptions, usage_tracking
-- RLS enabled on all three. handle_new_user trigger created in 006.

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  user_id    UUID PRIMARY KEY,
  email      VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.users
  ADD CONSTRAINT users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own row" ON public.users;
CREATE POLICY "Users view own row" ON public.users
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  subscription_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  tier                   VARCHAR(50) NOT NULL DEFAULT 'snapshot',
  start_date             TIMESTAMP DEFAULT NOW(),
  end_date               TIMESTAMP,
  status                 VARCHAR(50) NOT NULL DEFAULT 'active',
  stripe_customer_id     VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW(),
  CONSTRAINT subscriptions_tier_check   CHECK (tier   IN ('snapshot', 'portrait', 'studio')),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'cancelled', 'past_due'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id
  ON public.subscriptions(stripe_subscription_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own subscription" ON public.subscriptions;
CREATE POLICY "Users view own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- usage_tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  usage_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  month         INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year          INT NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_month_year
  ON public.usage_tracking(user_id, month, year);

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own usage" ON public.usage_tracking;
CREATE POLICY "Users view own usage" ON public.usage_tracking
  FOR SELECT USING (auth.uid() = user_id);
