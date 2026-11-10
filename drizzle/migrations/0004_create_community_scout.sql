CREATE TABLE public.focus_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  neighborhoods TEXT,
  interests TEXT,
  priorities TEXT,
  partner_types TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.focus_areas TO authenticated;
GRANT ALL ON public.focus_areas TO service_role;
ALTER TABLE public.focus_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own focus areas" ON public.focus_areas FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  details TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own resources" ON public.resources FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.scout_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  focus_area_id UUID REFERENCES public.focus_areas(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scout_findings TO authenticated;
GRANT ALL ON public.scout_findings TO service_role;
ALTER TABLE public.scout_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own scout findings" ON public.scout_findings FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.scout_state (
  user_id UUID PRIMARY KEY,
  lease_until TIMESTAMPTZ,
  paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  last_run_at TIMESTAMPTZ
);
GRANT ALL ON public.scout_state TO service_role;
ALTER TABLE public.scout_state ENABLE ROW LEVEL SECURITY;