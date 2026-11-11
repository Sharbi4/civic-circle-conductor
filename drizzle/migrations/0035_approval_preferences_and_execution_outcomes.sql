CREATE TABLE public.approval_preferences (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, scope_key text NOT NULL, label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, scope_key));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_preferences TO authenticated;
GRANT ALL ON public.approval_preferences TO service_role;
ALTER TABLE public.approval_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages approval preferences" ON public.approval_preferences FOR ALL TO authenticated USING(user_id = auth.uid()) WITH CHECK(user_id = auth.uid());
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS run_state text CHECK (run_state IN ('running','queued','succeeded','failed','needs_review')), ADD COLUMN IF NOT EXISTS run_error text, ADD COLUMN IF NOT EXISTS run_finished_at timestamptz, ADD COLUMN IF NOT EXISTS approval_mode text CHECK (approval_mode IN ('once','always'));
COMMENT ON COLUMN public.approvals.run_state IS 'Execution outcome; approved alone never means provider success.';