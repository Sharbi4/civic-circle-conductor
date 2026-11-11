CREATE UNIQUE INDEX tasks_full_schedule_key ON public.tasks(user_id,schedule_key);
CREATE OR REPLACE FUNCTION public.finish_agent_task(p_run uuid,p_next timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.agent_task_runs%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.agent_task_runs WHERE id=p_run AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Run is not active'; END IF;
 UPDATE public.tasks SET last_run_at=now(),last_error=NULL,scheduled_for=p_next,due_date=COALESCE((p_next AT TIME ZONE 'America/Phoenix')::date,due_date),done=(p_next IS NULL),done_at=CASE WHEN p_next IS NULL THEN now() ELSE NULL END WHERE id=r.task_id;
 UPDATE public.agent_task_runs SET status='completed',phase='completed',completed_at=now(),lease_until=NULL WHERE id=p_run;
END $$;
REVOKE ALL ON FUNCTION public.finish_agent_task(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_agent_task(uuid,timestamptz) TO service_role;