CREATE TABLE public.browser_sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, thread_id UUID NOT NULL, task TEXT NOT NULL, session_id TEXT NOT NULL, live_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.browser_sessions TO authenticated;
GRANT ALL ON public.browser_sessions TO service_role;
ALTER TABLE public.browser_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own browser sessions" ON public.browser_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);