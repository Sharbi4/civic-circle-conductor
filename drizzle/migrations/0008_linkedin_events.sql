ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS linkedin_org_id text;
CREATE TABLE public.linkedin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id text NOT NULL,
  name text NOT NULL,
  starts_at timestamptz,
  location text,
  post_urn text,
  status text NOT NULL DEFAULT 'live',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linkedin_events TO authenticated;
GRANT ALL ON public.linkedin_events TO service_role;
ALTER TABLE public.linkedin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own linkedin events" ON public.linkedin_events FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);