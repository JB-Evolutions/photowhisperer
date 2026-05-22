-- 004_camera_profiles.sql
-- Per arch-spec-v3.1.md §2.5

CREATE TABLE IF NOT EXISTS public.camera_profiles (
  user_id    UUID PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  body       VARCHAR(255),
  lenses     TEXT[],
  flash      VARCHAR(50),
  notes      TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.camera_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own profile" ON public.camera_profiles;
CREATE POLICY "Users view own profile" ON public.camera_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own profile" ON public.camera_profiles;
CREATE POLICY "Users update own profile" ON public.camera_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own profile" ON public.camera_profiles;
CREATE POLICY "Users insert own profile" ON public.camera_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
