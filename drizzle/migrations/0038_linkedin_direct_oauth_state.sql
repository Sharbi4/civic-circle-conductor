CREATE TABLE public.linkedin_oauth_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 state_hash text NOT NULL UNIQUE,
 opener_origin text NOT NULL,
 redirect_uri text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','exchanging','complete','consumed','failed')),
 token_ciphertext text,
 account_name text,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON TABLE public.linkedin_oauth_states TO service_role;
ALTER TABLE public.linkedin_oauth_states ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.linkedin_oauth_states IS 'Server-only, single-use, owner-bound LinkedIn OAuth handoffs. Browser roles have no access; token ciphertext is cleared after completion.';
CREATE INDEX linkedin_oauth_states_expiry ON public.linkedin_oauth_states(expires_at);