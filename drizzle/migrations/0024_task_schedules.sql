ALTER TABLE public.tasks ADD COLUMN repeat text;
ALTER TABLE public.tasks ADD COLUMN run_prompt text;
ALTER TABLE public.tasks ADD COLUMN thread_id uuid;
ALTER TABLE public.tasks ADD COLUMN last_run_at timestamptz;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_repeat_check CHECK (repeat IS NULL OR repeat IN ('daily','weekly','biweekly','monthly'));
CREATE INDEX tasks_scheduled_idx ON public.tasks (due_date) WHERE repeat IS NOT NULL AND done = false;