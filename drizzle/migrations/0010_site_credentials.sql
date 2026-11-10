CREATE TABLE public.site_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  domain text NOT NULL,
  username text NOT NULL,
  secret_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain, username)
);
GRANT SELECT, DELETE ON public.site_credentials TO authenticated;
GRANT ALL ON public.site_credentials TO service_role;
ALTER TABLE public.site_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own creds read" ON public.site_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own creds delete" ON public.site_credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE SELECT (secret_ciphertext) ON public.site_credentials FROM authenticated;