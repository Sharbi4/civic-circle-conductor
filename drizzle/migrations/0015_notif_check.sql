ALTER TABLE public.autopilot_state ADD COLUMN IF NOT EXISTS last_notif_check timestamptz;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS notif_checks boolean NOT NULL DEFAULT true;