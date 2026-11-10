ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS autonomy text NOT NULL DEFAULT 'manual';
ALTER TABLE public.organizations ADD CONSTRAINT organizations_autonomy_check CHECK (autonomy IN ('manual','assisted','auto'));
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS driver_lease timestamptz;
ALTER TABLE public.browser_sessions ADD COLUMN IF NOT EXISTS last_step_at timestamptz;

CREATE TABLE public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  based_on_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id)
);
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestions TO authenticated;
GRANT ALL ON public.suggestions TO service_role;
CREATE POLICY "own suggestions" ON public.suggestions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.autopilot_state (
  user_id uuid PRIMARY KEY,
  lease_until timestamptz,
  last_review_at timestamptz,
  paused_reason text
);
ALTER TABLE public.autopilot_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.autopilot_state TO authenticated;
GRANT ALL ON public.autopilot_state TO service_role;
CREATE POLICY "read own autopilot" ON public.autopilot_state FOR SELECT TO authenticated USING (auth.uid() = user_id);