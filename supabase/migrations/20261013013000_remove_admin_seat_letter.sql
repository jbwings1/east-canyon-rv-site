-- Seat letter is no longer collected or shown. The admin number is the staff code.

update public.profiles
set admin_seat = null
where admin_seat is not null;

comment on column public.profiles.admin_seat is
  'Unused. Kept so older functions still have the column. New staff are saved with a blank seat.';

create or replace function private.attach_staff_access(
  p_user_id uuid,
  p_staff_code text,
  p_admin_level integer,
  p_admin_seat text,
  p_admin_tasks text[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  caller public.profiles%rowtype;
  target public.profiles%rowtype;
  staff_code_clean text;
  tasks text[];
begin
  caller := private.assert_account_roles();
  if not public.has_admin_task('add_staff_access') then
    raise exception 'You are not assigned this function.';
  end if;

  if p_user_id is null then
    raise exception 'Member is required';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Member not found';
  end if;

  if target.member_id is null or length(trim(target.member_id)) = 0 then
    raise exception 'Staff access can only be added to an existing member';
  end if;

  if coalesce(target.is_admin, false)
     or (target.staff_code is not null and length(trim(target.staff_code)) > 0) then
    raise exception 'This account already has staff access';
  end if;

  if not coalesce(p_admin_level, 0) >= 2 or p_admin_level is null then
    raise exception 'New staff must be level 2 or lower (level 1 is reserved)';
  end if;

  if caller.admin_level is distinct from 1
     and p_admin_level <= coalesce(caller.admin_level, 99) then
    raise exception 'You can only create staff below your level';
  end if;

  staff_code_clean := trim(coalesce(p_staff_code, ''));
  if staff_code_clean = '' then
    raise exception 'Staff code is required';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id <> p_user_id
      and p.staff_code is not null
      and lower(trim(p.staff_code)) = lower(staff_code_clean)
  ) then
    raise exception 'That staff code is already in use';
  end if;

  tasks := private.normalize_admin_tasks(p_admin_tasks, caller, p_admin_level);
  if coalesce(array_length(tasks, 1), 0) = 0 then
    raise exception 'Assign at least one job or function';
  end if;

  update public.profiles
  set is_admin = true,
      admin_level = p_admin_level,
      admin_seat = null,
      staff_code = staff_code_clean,
      admin_tasks = tasks,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'kind', 'attach_staff',
    'user_id', p_user_id,
    'staff_code', staff_code_clean,
    'admin_level', p_admin_level,
    'admin_seat', null,
    'admin_tasks', to_jsonb(tasks)
  );
end;
$$;

