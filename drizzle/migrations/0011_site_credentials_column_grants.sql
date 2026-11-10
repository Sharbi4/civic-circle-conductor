REVOKE SELECT ON public.site_credentials FROM authenticated;
GRANT SELECT (id, user_id, label, domain, username, created_at, updated_at) ON public.site_credentials TO authenticated;