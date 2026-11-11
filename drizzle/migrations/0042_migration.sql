CREATE TABLE public.event_profiles (
  goal_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  venue text NOT NULL DEFAULT '',
  venue_details text NOT NULL DEFAULT '',
  venue_status text NOT NULL DEFAULT 'searching',
  budget numeric,
  spent numeric,
  budget_notes text NOT NULL DEFAULT '',
  staff jsonb NOT NULL DEFAULT '[]'::jsonb,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  vendors jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_profiles TO authenticated;
GRANT ALL ON public.event_profiles TO service_role;
ALTER TABLE public.event_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages event profiles" ON public.event_profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  text text NOT NULL,
  color text NOT NULL DEFAULT 'sun',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sticky_notes TO authenticated;
GRANT ALL ON public.sticky_notes TO service_role;
ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages sticky notes" ON public.sticky_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);