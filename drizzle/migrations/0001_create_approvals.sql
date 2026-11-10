CREATE TABLE public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action_type text not null check (action_type in ('outreach', 'booking', 'payment', 'other')),
  title text not null,
  details text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.approvals TO authenticated;
GRANT ALL ON public.approvals TO service_role;

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own approvals" ON public.approvals
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);