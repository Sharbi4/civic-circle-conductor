update public.approvals a
set thread_id = coalesce(
  case when a.payload ? 'thread' and a.payload->>'thread' ~ '^[0-9a-fA-F-]{36}$' then (a.payload->>'thread')::uuid end,
  case
    when a.payload->>'kind' like 'linkedin\_%' escape '\' then (select t.id from public.threads t where t.user_id = a.user_id and t.title = 'LinkedIn Agent' limit 1)
    when a.payload->>'kind' = 'x_post' then (select t.id from public.threads t where t.user_id = a.user_id and t.title = 'X Agent' limit 1)
    when a.payload->>'kind' like 'eventbrite\_%' escape '\' then (select t.id from public.threads t where t.user_id = a.user_id and t.title = 'Eventbrite Agent' limit 1)
  end,
  (select t.id from public.threads t where t.user_id = a.user_id and t.kind = 'main' order by t.created_at limit 1)
)
where a.thread_id is null