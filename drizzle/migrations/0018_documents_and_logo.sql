ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url text;
CREATE TABLE public.documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, thread_id uuid, title text NOT NULL, kind text NOT NULL DEFAULT 'document', content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents" ON public.documents FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());