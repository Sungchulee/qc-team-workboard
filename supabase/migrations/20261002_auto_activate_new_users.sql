-- 신규 회원을 관리자 승인 없이 즉시 활성화

alter table public.profiles alter column is_active set default true;

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
  values (new.id, lower(new.email), requested_name, 'user', true, next_order)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 현재 승인 대기 상태인 계정도 즉시 사용할 수 있도록 활성화
update public.profiles
set is_active = true
where is_active = false;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
