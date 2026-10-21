-- 날짜 미정 업무(개인 업무 보관함) 지원
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.tasks
  alter column scheduled_date drop not null;

create index if not exists tasks_unscheduled_idx
  on public.tasks(assignee_id, updated_at desc)
  where scheduled_date is null;
