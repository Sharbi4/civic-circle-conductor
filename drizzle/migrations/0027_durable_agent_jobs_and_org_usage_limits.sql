ALTER TABLE public.organizations ADD COLUMN automation_paused boolean NOT NULL DEFAULT false, ADD COLUMN usage_pause_reason text, ADD COLUMN daily_ai_limit integer NOT NULL DEFAULT 50, ADD COLUMN daily_browser_minutes integer NOT NULL DEFAULT 30, ADD COLUMN daily_browser_sessions integer NOT NULL DEFAULT 3, ADD COLUMN browser_session_minutes integer NOT NULL DEFAULT 5;
ALTER TABLE public.tasks ADD COLUMN scheduled_for timestamptz, ADD COLUMN job_kind text NOT NULL DEFAULT 'organizer', ADD COLUMN schedule_key text, ADD COLUMN last_error text;
CREATE UNIQUE INDEX tasks_schedule_key ON public.tasks(user_id, schedule_key) WHERE schedule_key IS NOT NULL;
CREATE TABLE public.org_usage_daily (
 user_id uuid NOT NULL, usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date, ai_calls integer NOT NULL DEFAULT 0, browser_minutes integer NOT NULL DEFAULT 0, browser_sessions integer NOT NULL DEFAULT 0, PRIMARY KEY(user_id, usage_date)
);
GRANT SELECT ON public.org_usage_daily TO authenticated;
GRANT ALL ON public.org_usage_daily TO service_role;
ALTER TABLE public.org_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own daily usage" ON public.org_usage_daily FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.agent_task_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
 occurrence_key text NOT NULL, status text NOT NULL DEFAULT 'queued', phase text NOT NULL DEFAULT 'not_started', attempt integer NOT NULL DEFAULT 0,
 lease_until timestamptz, started_at timestamptz, completed_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(task_id, occurrence_key)
);
GRANT SELECT ON public.agent_task_runs TO authenticated;
GRANT ALL ON public.agent_task_runs TO service_role;
ALTER TABLE public.agent_task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own task runs" ON public.agent_task_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.agent_job_locks (name text PRIMARY KEY, token uuid, lease_until timestamptz, last_completed_at timestamptz);
GRANT ALL ON public.agent_job_locks TO service_role;
ALTER TABLE public.agent_job_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_sessions ADD COLUMN expires_at timestamptz;
CREATE OR REPLACE FUNCTION public.reserve_org_usage(p_user uuid, p_kind text, p_units integer DEFAULT 1) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.organizations%ROWTYPE; u public.org_usage_daily%ROWTYPE;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_units < 1 THEN RAISE EXCEPTION 'Invalid units'; END IF;
 SELECT * INTO o FROM public.organizations WHERE user_id = p_user FOR UPDATE;
 IF NOT FOUND OR o.automation_paused OR o.usage_pause_reason IS NOT NULL THEN RETURN false; END IF;
 INSERT INTO public.org_usage_daily(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO u FROM public.org_usage_daily WHERE user_id=p_user AND usage_date=(now() AT TIME ZONE 'UTC')::date FOR UPDATE;
 IF p_kind='ai' THEN
  IF u.ai_calls + p_units > o.daily_ai_limit THEN RETURN false; END IF;
  UPDATE public.org_usage_daily SET ai_calls=ai_calls+p_units WHERE user_id=p_user AND usage_date=u.usage_date;
 ELSIF p_kind='browser' THEN
  IF u.browser_minutes+p_units > o.daily_browser_minutes OR u.browser_sessions+1 > o.daily_browser_sessions THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.browser_sessions WHERE user_id=p_user AND status='running' AND (expires_at IS NULL OR expires_at>now())) THEN RETURN false; END IF;
  UPDATE public.org_usage_daily SET browser_minutes=browser_minutes+p_units,browser_sessions=browser_sessions+1 WHERE user_id=p_user AND usage_date=u.usage_date;
 ELSE RAISE EXCEPTION 'Invalid usage kind'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_org_usage(uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_org_usage(uuid,text,integer) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.claim_agent_job(p_name text, p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.agent_job_locks(name,token,lease_until) VALUES(p_name,p_token,now()+interval '14 minutes')
 ON CONFLICT(name) DO UPDATE SET token=EXCLUDED.token,lease_until=EXCLUDED.lease_until WHERE agent_job_locks.lease_until IS NULL OR agent_job_locks.lease_until<now();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_job(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_job(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.enqueue_due_agent_tasks() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.agent_task_runs(user_id,task_id,occurrence_key)
 SELECT t.user_id,t.id,COALESCE(t.scheduled_for::text,t.due_date::text)
 FROM public.tasks t JOIN public.organizations o ON o.user_id=t.user_id
 WHERE NOT t.done AND t.kind='task' AND (t.run_prompt IS NOT NULL OR t.repeat IS NOT NULL OR t.scheduled_for IS NOT NULL)
 AND COALESCE(t.scheduled_for,t.due_date::timestamp AT TIME ZONE 'America/Phoenix')<=now()
 AND NOT o.automation_paused AND o.usage_pause_reason IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.autopilot_state s WHERE s.user_id=t.user_id AND s.paused_reason IS NOT NULL)
 ON CONFLICT(task_id,occurrence_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_due_agent_tasks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_agent_tasks() TO service_role;
CREATE OR REPLACE FUNCTION public.claim_agent_task(p_id uuid) RETURNS SETOF public.agent_task_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN QUERY UPDATE public.agent_task_runs r SET status='running',phase='claimed',attempt=attempt+1,lease_until=now()+interval '12 minutes',started_at=now()
 WHERE r.id=p_id AND r.status='queued' AND r.attempt<3
 AND NOT EXISTS(SELECT 1 FROM public.agent_task_runs x WHERE x.user_id=r.user_id AND x.status='running' AND x.lease_until>now())
 RETURNING r.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_agent_task(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_task(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.validate_task_run_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.task_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=NEW.task_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION 'Task must belong to organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_run_owner BEFORE INSERT OR UPDATE ON public.agent_task_runs FOR EACH ROW EXECUTE FUNCTION public.validate_task_run_owner();