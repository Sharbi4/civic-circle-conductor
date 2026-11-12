CREATE OR REPLACE FUNCTION public.settle_quiet_reviews()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  -- A planning review only needs AI when something happened since the last one: a new organizer
  -- message or a finished task. Quiet reviews are closed here and checked again in 15 minutes.
  WITH quiet AS (
    SELECT r.id AS run_id
    FROM public.agent_task_runs r
    JOIN public.tasks t ON t.id = r.task_id AND t.job_kind = 'review'
    JOIN public.autopilot_state s ON s.user_id = r.user_id AND s.last_review_at IS NOT NULL
    WHERE r.status = 'queued'
      AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.user_id = r.user_id AND m.role = 'user' AND m.created_at > s.last_review_at)
      AND NOT EXISTS (SELECT 1 FROM public.tasks d WHERE d.user_id = r.user_id AND d.created_by <> 'system' AND d.done_at > s.last_review_at)
    LIMIT 500
  ), settled AS (
    UPDATE public.agent_task_runs r
    SET status = 'completed', phase = 'skipped_quiet', completed_at = now(), lease_until = NULL
    FROM quiet q
    WHERE r.id = q.run_id AND r.status = 'queued'
    RETURNING r.task_id
  )
  UPDATE public.tasks t
  SET scheduled_for = now() + interval '15 minutes', last_run_at = now()
  FROM settled s
  WHERE t.id = s.task_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_quiet_reviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_quiet_reviews() TO service_role;