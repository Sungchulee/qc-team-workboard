-- 회원가입 승인 흐름 + 사용자 관리 보안정책
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.profiles alter column is_active set default false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_name text;
  next_order integer;
begin
  if lower(split_part(new.email, '@', 2)) <> 'ysls.co.kr' then
    raise exception 'Only @ysls.co.kr email addresses are allowed';
  end if;

  requested_name := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if requested_name !~ '^[가-힣]{2,10}$' then
    requested_name := split_part(lower(new.email), '@', 1);
  end if;

  select coalesce(max(display_order), 0) + 1 into next_order from public.profiles;
  insert into public.profiles (id, email, display_name, role, is_active, display_order)
  values (new.id, lower(new.email), requested_name, 'user', false, next_order)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles for select to authenticated
using (id = auth.uid() or (public.is_active_user() and is_active = true) or public.is_admin());

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select to authenticated
using (public.is_active_user());

drop policy if exists "tasks_create" on public.tasks;
create policy "tasks_create" on public.tasks for insert to authenticated
with check (
  public.is_active_user()
  and created_by = auth.uid()
  and (assignee_id = auth.uid() or public.is_admin())
);

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated
using (
  public.is_active_user()
  and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin())
)
with check (
  public.is_active_user()
  and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin())
);

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks for delete to authenticated
using (
  public.is_active_user()
  and (created_by = auth.uid() or assignee_id = auth.uid() or public.is_admin())
);

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
