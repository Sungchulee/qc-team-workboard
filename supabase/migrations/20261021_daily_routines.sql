-- 기존 운영 DB에 한 번 실행: 담당자별 매일 루틴 업무 목록
create table if not exists public.daily_routines (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  details text not null default '' check (char_length(details) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_routines_assignee_idx
  on public.daily_routines(assignee_id, created_at, id);

drop trigger if exists daily_routines_set_updated_at on public.daily_routines;
create trigger daily_routines_set_updated_at before update on public.daily_routines
for each row execute function public.set_updated_at();

alter table public.daily_routines enable row level security;

drop policy if exists "daily_routines_read" on public.daily_routines;
create policy "daily_routines_read" on public.daily_routines for select to authenticated
using (public.is_active_user());

drop policy if exists "daily_routines_create" on public.daily_routines;
create policy "daily_routines_create" on public.daily_routines for insert to authenticated
with check (
  public.is_active_user()
  and created_by = auth.uid()
  and (assignee_id = auth.uid() or public.is_admin())
);

drop policy if exists "daily_routines_update" on public.daily_routines;
create policy "daily_routines_update" on public.daily_routines for update to authenticated
using (public.is_active_user() and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin()))
with check (public.is_active_user() and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin()));

drop policy if exists "daily_routines_delete" on public.daily_routines;
create policy "daily_routines_delete" on public.daily_routines for delete to authenticated
using (public.is_active_user() and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin()));

revoke all on public.daily_routines from anon;
grant select, insert, update, delete on public.daily_routines to authenticated;
