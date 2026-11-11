ALTER TABLE public.organizations ADD COLUMN browser_reservation_until timestamptz;
CREATE OR REPLACE FUNCTION public.claim_agent_task(p_id uuid) RETURNS SETOF public.agent_task_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid;
BEGIN
 SELECT user_id INTO owner_id FROM public.agent_task_runs WHERE id=p_id;
 PERFORM 1 FROM public.organizations WHERE user_id=owner_id FOR UPDATE;
 RETURN QUERY UPDATE public.agent_task_runs r SET status='running',phase='claimed',attempt=attempt+1,lease_until=now()+interval '12 minutes',started_at=now()
 WHERE r.id=p_id AND r.status='queued' AND r.attempt<3
 AND NOT EXISTS(SELECT 1 FROM public.agent_task_runs x WHERE x.user_id=r.user_id AND x.status='running' AND x.lease_until>now()) RETURNING r.*;
END $$;
CREATE OR REPLACE FUNCTION public.reserve_org_usage(p_user uuid,p_kind text,p_units integer DEFAULT 1) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.organizations%ROWTYPE; u public.org_usage_daily%ROWTYPE;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF p_units<1 THEN RAISE EXCEPTION 'Invalid units'; END IF;
 SELECT * INTO o FROM public.organizations WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND OR o.automation_paused OR o.usage_pause_reason IS NOT NULL THEN RETURN false; END IF;
 INSERT INTO public.org_usage_daily(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO u FROM public.org_usage_daily WHERE user_id=p_user AND usage_date=(now() AT TIME ZONE 'UTC')::date FOR UPDATE;
 IF p_kind='ai' THEN
  IF u.ai_calls+p_units>o.daily_ai_limit THEN RETURN false; END IF;
  UPDATE public.org_usage_daily SET ai_calls=ai_calls+p_units WHERE user_id=p_user AND usage_date=u.usage_date;
 ELSIF p_kind='browser' THEN
  IF u.browser_minutes+p_units>o.daily_browser_minutes OR u.browser_sessions+1>o.daily_browser_sessions OR o.browser_reservation_until>now() THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.browser_sessions WHERE user_id=p_user AND status='running' AND (expires_at IS NULL OR expires_at>now())) THEN RETURN false; END IF;
  UPDATE public.organizations SET browser_reservation_until=now()+make_interval(mins=>p_units) WHERE user_id=p_user;
  UPDATE public.org_usage_daily SET browser_minutes=browser_minutes+p_units,browser_sessions=browser_sessions+1 WHERE user_id=p_user AND usage_date=u.usage_date;
 ELSE RAISE EXCEPTION 'Invalid usage kind'; END IF;
 RETURN true;
END $$;