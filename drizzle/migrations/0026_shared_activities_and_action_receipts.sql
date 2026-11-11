CREATE TABLE public.activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 title text NOT NULL, goal text NOT NULL DEFAULT '', audience text NOT NULL DEFAULT '', community_input text NOT NULL DEFAULT '',
 proposed_date text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
 budget numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'USD', constraints text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'planning', registration_url text NOT NULL DEFAULT '', attendance integer NOT NULL DEFAULT 0,
 follow_up text NOT NULL DEFAULT '', lessons jsonb NOT NULL DEFAULT '{}'::jsonb, approved_plan jsonb,
 plan_approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.activities FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.tasks ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL, ADD COLUMN assignee text NOT NULL DEFAULT '';
ALTER TABLE public.threads ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;
ALTER TABLE public.approvals ADD COLUMN activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL, ADD COLUMN execution_status text NOT NULL DEFAULT 'not_started';
CREATE TABLE public.action_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, activity_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
 approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL, action text NOT NULL, platform text NOT NULL, account_name text NOT NULL,
 object_url text, approval_required boolean NOT NULL DEFAULT true, approved_at timestamptz, completed_at timestamptz NOT NULL DEFAULT now(), details text NOT NULL DEFAULT '',
 UNIQUE(approval_id)
);
GRANT SELECT ON public.action_receipts TO authenticated;
GRANT ALL ON public.action_receipts TO service_role;
ALTER TABLE public.action_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own receipts" ON public.action_receipts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.validate_activity_links() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.activity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.activities WHERE id = NEW.activity_id AND user_id = NEW.user_id) THEN RAISE EXCEPTION 'Activity must belong to the same organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tasks_activity_owner BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.validate_activity_links();
CREATE TRIGGER threads_activity_owner BEFORE INSERT OR UPDATE ON public.threads FOR EACH ROW EXECUTE FUNCTION public.validate_activity_links();
CREATE TRIGGER approvals_activity_owner BEFORE INSERT OR UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.validate_activity_links();
CREATE TRIGGER receipts_activity_owner BEFORE INSERT OR UPDATE ON public.action_receipts FOR EACH ROW EXECUTE FUNCTION public.validate_activity_links();
CREATE OR REPLACE FUNCTION public.invalidate_activity_plan() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 NEW.updated_at = now();
 IF (NEW.proposed_date, NEW.location, NEW.description, NEW.budget, NEW.constraints, NEW.audience, NEW.goal) IS DISTINCT FROM (OLD.proposed_date, OLD.location, OLD.description, OLD.budget, OLD.constraints, OLD.audience, OLD.goal) THEN NEW.approved_plan = NULL; NEW.plan_approved_at = NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER activity_plan_changes BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.invalidate_activity_plan();