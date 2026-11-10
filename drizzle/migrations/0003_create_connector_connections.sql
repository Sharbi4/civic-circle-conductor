CREATE TABLE public.connector_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector text NOT NULL,
  access_token_ciphertext text NOT NULL,
  account_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector)
);

GRANT ALL ON public.connector_connections TO service_role;
ALTER TABLE public.connector_connections ENABLE ROW LEVEL SECURITY;