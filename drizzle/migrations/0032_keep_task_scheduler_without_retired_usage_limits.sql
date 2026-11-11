CREATE OR REPLACE FUNCTION public.enqueue_due_agent_tasks() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 INSERT INTO public.agent_task_runs(user_id,task_id,occurrence_key)
 SELECT t.user_id,t.id,COALESCE(t.scheduled_for::text,t.due_date::text)
 FROM public.tasks t JOIN public.organizations o ON o.user_id=t.user_id
 WHERE NOT t.done AND t.kind='task' AND (t.run_prompt IS NOT NULL OR t.repeat IS NOT NULL OR t.scheduled_for IS NOT NULL)
 AND COALESCE(t.scheduled_for,t.due_date::timestamp AT TIME ZONE 'America/Phoenix')<=now()
 AND NOT EXISTS(SELECT 1 FROM public.autopilot_state s WHERE s.user_id=t.user_id AND s.paused_reason IS NOT NULL)
 ON CONFLICT(task_id,occurrence_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_due_agent_tasks() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_agent_tasks() TO service_role;