ALTER TABLE public.polls ADD COLUMN event jsonb;
COMMENT ON COLUMN public.polls.event IS 'Linked event details (title, start, end, timezone, location, url, image) shown on the public RSVP page';