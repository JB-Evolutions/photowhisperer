-- 005_sessions.sql
-- Per arch-spec-v3.1.md §2.6 and §2.7

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  title      VARCHAR(120),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_updated
  ON public.sessions(user_id, updated_at DESC);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own sessions" ON public.sessions;
CREATE POLICY "Users view own sessions" ON public.sessions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- session_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(session_id) ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content    JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
  ON public.session_messages(session_id, created_at);

ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own session messages" ON public.session_messages;
CREATE POLICY "Users view own session messages" ON public.session_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.session_id = session_messages.session_id
        AND sessions.user_id = auth.uid()
    )
  );
