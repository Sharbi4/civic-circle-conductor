ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS step_key text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS depends_on text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS trigger_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS step_state text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS result_url text;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_step_state_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_step_state_check CHECK (step_state IS NULL OR step_state IN ('waiting','ready','running','awaiting_approval','awaiting_reply','done','skipped','failed'));
CREATE UNIQUE INDEX IF NOT EXISTS tasks_goal_step_key_uniq ON public.tasks (goal_id, step_key) WHERE step_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS approvals_launch_task_idx ON public.approvals ((payload->>'launch_task_id')) WHERE payload ? 'launch_task_id';