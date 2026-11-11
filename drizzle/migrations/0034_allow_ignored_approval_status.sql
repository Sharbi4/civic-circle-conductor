ALTER TABLE public.approvals DROP CONSTRAINT approvals_status_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_status_check CHECK(status IN ('pending','approved','declined','ignored'));