CREATE OR REPLACE FUNCTION public.finish_agent_task(p_run uuid,p_next timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.agent_task_runs%ROWTYPE; next_time timestamptz;
BEGIN
 next_time = CASE WHEN p_next='infinity'::timestamptz THEN NULL ELSE p_next END;
 SELECT * INTO r FROM public.agent_task_runs WHERE id=p_run AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Run is not active'; END IF;
 UPDATE public.tasks SET last_run_at=now(),last_error=NULL,scheduled_for=next_time,due_date=COALESCE((next_time AT TIME ZONE 'America/Phoenix')::date,due_date),done=(next_time IS NULL),done_at=CASE WHEN next_time IS NULL THEN now() ELSE NULL END WHERE id=r.task_id;
 UPDATE public.agent_task_runs SET status='completed',phase='completed',completed_at=now(),lease_until=NULL WHERE id=p_run;
END $$;