CREATE TABLE public.info_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, phone text, organization text NOT NULL, message text, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.info_requests TO service_role;
ALTER TABLE public.info_requests ENABLE ROW LEVEL SECURITY;