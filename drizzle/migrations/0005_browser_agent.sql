ALTER TABLE public.browser_sessions
  ADD COLUMN goal text,
  ADD COLUMN agent_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN submit_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN connect_url text;
ALTER TABLE public.approvals ADD COLUMN browser_session_id uuid;