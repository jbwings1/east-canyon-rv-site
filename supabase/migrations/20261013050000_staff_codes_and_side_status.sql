-- Staff codes are assigned from the job farthest down the list and are never reused.
-- Staff status and member status are separate so closing one side of a dual
-- account does not ban the other side's sign-in.
-- admin 001 (formerly A-001) stays admin_level 1. Other staff keep their codes.

alter table public.profiles
  add column if not exists staff_status text;

alter table public.profiles
  drop constraint if exists profiles_staff_status_check;

alter table public.profiles
  add constraint profiles_staff_status_check
  check (
    staff_status is null
    or staff_status in ('pending_activation', 'active', 'suspended', 'closed')
  );

comment on column public.profiles.staff_status is
  'Staff-side status. Null when the account has no staff access. Member-only accounts keep using account_status.';

update public.profiles
set staff_status = coalesce(nullif(btrim(account_status), ''), 'active')
where staff_status is null
  and (
    coalesce(is_admin, false)
    or nullif(btrim(coalesce(staff_code, '')), '') is not null
  );

create table if not exists public.staff_code_registry (
  code text primary key,
  profile_id uuid,
  created_at timestamptz not null default now()
);

comment on table public.staff_code_registry is
  'Every staff code ever assigned, including closed and deleted staff, so a code is never reused.';

alter table public.staff_code_registry enable row level security;

revoke all on table public.staff_code_registry from public;
revoke all on table public.staff_code_registry from anon, authenticated;

insert into public.staff_code_registry (code, profile_id)
select btrim(p.staff_code), p.id
from public.profiles p
where nullif(btrim(coalesce(p.staff_code, '')), '') is not null
on conflict (code) do nothing;

-- Retired spelling of the top admin code. Do not issue it again.
insert into public.staff_code_registry (code, profile_id)
select 'A-001', p.id
from public.profiles p
where lower(btrim(coalesce(p.staff_code, ''))) = 'a-001'
on conflict (code) do nothing;

update public.profiles
set staff_code = 'admin 001',
    admin_level = 1
where lower(btrim(coalesce(staff_code, ''))) = 'a-001'
   or (
     admin_level = 1
     and lower(btrim(coalesce(staff_code, ''))) in ('a-001', 'admin 001')
   );

insert into public.staff_code_registry (code, profile_id)
select 'admin 001', p.id
from public.profiles p
where lower(btrim(coalesce(p.staff_code, ''))) = 'admin 001'
on conflict (code) do update
set profile_id = excluded.profile_id;

create unique index if not exists profiles_staff_code_lower_uidx
  on public.profiles (lower(btrim(staff_code)))
  where staff_code is not null and length(btrim(staff_code)) > 0;

create or replace function private.is_top_admin(caller public.profiles)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select caller.admin_level = 1
    or lower(btrim(coalesce(caller.staff_code, ''))) = 'admin 001';
$$;

create or replace function private.is_admin_code(code text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select lower(btrim(coalesce(code, ''))) ~ '^admin [0-9]{3}$';
$$;

revoke all on function private.is_top_admin(public.profiles) from public;
revoke all on function private.is_top_admin(public.profiles) from anon, authenticated;
revoke all on function private.is_admin_code(text) from public;
revoke all on function private.is_admin_code(text) from anon, authenticated;

create or replace function private.staff_code_taken(candidate text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.profiles p
    where lower(btrim(coalesce(p.staff_code, ''))) = lower(btrim(coalesce(candidate, '')))
  )
  or exists (
    select 1
    from public.staff_code_registry r
    where lower(btrim(r.code)) = lower(btrim(coalesce(candidate, '')))
  );
$$;

revoke all on function private.staff_code_taken(text) from public;
revoke all on function private.staff_code_taken(text) from anon, authenticated;

-- 1 FD, 2 RA, 3 SEA, 4 WE, 5 AM, 6 SM, 7 admin.
-- Admin wins even when other jobs are checked. Otherwise the job farthest
-- down the list wins. A function with no job uses that function's parent
-- series and never SM. Staff functions alone use FD.
create or replace function private.staff_code_series(p_tasks text[])
returns integer
language plpgsql
immutable
set search_path to ''
as $$
declare
  tasks text[] := coalesce(p_tasks, '{}'::text[]);
  chosen integer := 0;
  job_order text[] := array[
    'front_desk',
    'reservation_agent',
    'special_events',
    'website_editor',
    'accounts_manager',
    'site_manager'
  ];
  i integer;
begin
  if 'admin' = any (tasks) then
    return 7;
  end if;

  for i in 1..6 loop
    if job_order[i] = any (tasks) then
      chosen := i;
    end if;
  end loop;
  if chosen > 0 then
    return chosen;
  end if;

  if tasks && array['view_reservations', 'office_check_in', 'occupancy_names', 'reservations_view']::text[] then
    chosen := 1;
  end if;
  if tasks && array['make_reservation', 'edit_reservation', 'confirm_reservation', 'cancel_reservation', 'override_rule', 'reservations_manage']::text[] then
    chosen := 2;
  end if;
  if tasks && array['mark_calendar']::text[] then
    chosen := 3;
  end if;
  if tasks && array['manage_alerts', 'alert_photos', 'delete_alert', 'resort_calendar', 'gallery', 'board_members', 'edit_calendar_note', 'edit_calendar_heading', 'website']::text[] then
    chosen := 4;
  end if;
  if tasks && array['member_accounts', 'member_password', 'member_charges', 'run_reports', 'members', 'passwords']::text[] then
    chosen := 5;
  end if;
  if chosen = 0 then
    chosen := 1;
  end if;
  return chosen;
end;
$$;

revoke all on function private.staff_code_series(text[]) from public;
revoke all on function private.staff_code_series(text[]) from anon, authenticated;

create or replace function private.next_staff_code(p_tasks text[])
returns text
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  series integer := private.staff_code_series(p_tasks);
  prefixes text[] := array['FD', 'RA', 'SEA', 'WE', 'AM', 'SM'];
  n integer;
  candidate text;
begin
  if series = 7 then
    for n in 1..999 loop
      candidate := 'admin ' || lpad(n::text, 3, '0');
      if not private.staff_code_taken(candidate) then
        return candidate;
      end if;
    end loop;
    raise exception 'No free admin staff code remains';
  end if;

  for n in 1..999 loop
    candidate := prefixes[series] || lpad(n::text, 3, '0');
    if not private.staff_code_taken(candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'No free staff code remains';
end;
$$;

revoke all on function private.next_staff_code(text[]) from public;
revoke all on function private.next_staff_code(text[]) from anon, authenticated;

create or replace function private.reserve_staff_code(p_tasks text[], p_profile_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  assigned text;
begin
  perform pg_advisory_xact_lock(hashtext('east-canyon-staff-code'));
  assigned := private.next_staff_code(p_tasks);
  insert into public.staff_code_registry (code, profile_id)
  values (assigned, p_profile_id);
  return assigned;
end;
$$;

revoke all on function private.reserve_staff_code(text[], uuid) from public;
revoke all on function private.reserve_staff_code(text[], uuid) from anon, authenticated;

create or replace function public.reserve_staff_code(p_tasks text[])
returns text
language sql
security definer
set search_path to ''
as $$
  select private.reserve_staff_code(p_tasks, null);
$$;

revoke all on function public.reserve_staff_code(text[]) from public;
revoke all on function public.reserve_staff_code(text[]) from anon, authenticated;
grant execute on function public.reserve_staff_code(text[]) to service_role;

-- Capability check. Assignment limits are applied in normalize_admin_tasks.
create or replace function private.caller_has_job(
  caller public.profiles,
  task text
)
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  tasks text[] := coalesce(caller.admin_tasks, '{}'::text[]);
  site_manager boolean := 'site_manager' = any (tasks);
  admin_staff boolean := private.is_admin_code(caller.staff_code) or 'admin' = any (tasks);
  reservation_agent boolean :=
    'reservation_agent' = any (tasks) or 'reservations_manage' = any (tasks);
  front_desk boolean :=
    'front_desk' = any (tasks) or reservation_agent or 'reservations_view' = any (tasks);
  website_editor boolean :=
    'website_editor' = any (tasks) or 'website' = any (tasks);
  special_events boolean :=
    'special_events' = any (tasks) or 'website' = any (tasks);
  accounts boolean :=
    'accounts_manager' = any (tasks) or 'members' = any (tasks) or 'passwords' = any (tasks);
  legacy_staff boolean := 'staff' = any (tasks);
  legacy_roles boolean := 'account_roles' = any (tasks);
  staff_functions boolean :=
    legacy_staff
    or admin_staff
    or 'create_staff' = any (tasks)
    or 'edit_staff' = any (tasks)
    or 'close_staff' = any (tasks)
    or 'add_staff_access' = any (tasks)
    or 'add_membership' = any (tasks)
    or 'remove_staff_access' = any (tasks);
begin
  if private.is_top_admin(caller) or site_manager then
    return true;
  end if;

  return case task
    when 'front_desk' then front_desk
    when 'reservations_view' then front_desk
    when 'reservation_agent' then reservation_agent
    when 'reservations_manage' then reservation_agent
    when 'special_events' then special_events
    when 'website_editor' then website_editor
    when 'website' then website_editor
    when 'accounts_manager' then accounts
    when 'members' then accounts
    when 'passwords' then accounts
    when 'reports' then accounts
    when 'invoices' then accounts
    when 'staff' then staff_functions
    when 'account_roles' then
      legacy_roles
      or admin_staff
      or 'add_staff_access' = any (tasks)
      or 'add_membership' = any (tasks)
      or 'remove_staff_access' = any (tasks)
    when 'site_manager' then false
    when 'admin' then false
    when 'view_reservations' then front_desk or task = any (tasks)
    when 'office_check_in' then front_desk or task = any (tasks)
    when 'occupancy_names' then front_desk or task = any (tasks)
    when 'make_reservation' then reservation_agent or task = any (tasks)
    when 'edit_reservation' then reservation_agent or task = any (tasks)
    when 'confirm_reservation' then reservation_agent or task = any (tasks)
    when 'cancel_reservation' then reservation_agent or task = any (tasks)
    when 'override_rule' then reservation_agent or task = any (tasks)
    when 'mark_calendar' then special_events or task = any (tasks)
    when 'manage_alerts' then website_editor or task = any (tasks)
    when 'alert_photos' then website_editor or task = any (tasks)
    when 'resort_calendar' then website_editor or task = any (tasks)
    when 'gallery' then website_editor or task = any (tasks)
    when 'board_members' then website_editor or task = any (tasks)
    when 'edit_calendar_note' then website_editor or task = any (tasks)
    when 'delete_alert' then task = any (tasks)
    when 'edit_calendar_heading' then task = any (tasks)
    when 'member_accounts' then accounts or task = any (tasks)
    when 'member_password' then accounts or task = any (tasks)
    when 'member_charges' then accounts or task = any (tasks)
    when 'run_reports' then accounts or task = any (tasks)
    when 'create_staff' then staff_functions and (legacy_staff or admin_staff or task = any (tasks) or site_manager)
    when 'edit_staff' then legacy_staff or admin_staff or task = any (tasks)
    when 'close_staff' then legacy_staff or admin_staff or task = any (tasks)
    when 'add_staff_access' then legacy_roles or admin_staff or task = any (tasks)
    when 'add_membership' then legacy_roles or admin_staff or task = any (tasks)
    when 'remove_staff_access' then legacy_roles or admin_staff or task = any (tasks)
    else task = any (tasks)
  end;
end;
$$;

revoke all on function private.caller_has_job(public.profiles, text) from public;
revoke all on function private.caller_has_job(public.profiles, text) from anon, authenticated;

create or replace function private.allowed_admin_tasks()
returns text[]
language sql
immutable
set search_path to ''
as $$
  select array[
    'front_desk',
    'reservation_agent',
    'special_events',
    'website_editor',
    'accounts_manager',
    'site_manager',
    'admin',
    'members',
    'passwords',
    'reservations_view',
    'reservations_manage',
    'website',
    'staff',
    'account_roles',
    'view_reservations',
    'office_check_in',
    'occupancy_names',
    'make_reservation',
    'edit_reservation',
    'confirm_reservation',
    'cancel_reservation',
    'override_rule',
    'mark_calendar',
    'edit_calendar_note',
    'edit_calendar_heading',
    'manage_alerts',
    'alert_photos',
    'delete_alert',
    'resort_calendar',
    'gallery',
    'board_members',
    'member_accounts',
    'member_password',
    'member_charges',
    'run_reports',
    'create_staff',
    'edit_staff',
    'close_staff',
    'add_staff_access',
    'add_membership',
    'remove_staff_access'
  ];
$$;

create or replace function private.normalize_admin_tasks(
  raw_tasks text[],
  caller public.profiles,
  new_level integer
)
returns text[]
language plpgsql
stable
set search_path to ''
as $$
declare
  allowed text[] := private.allowed_admin_tasks();
  filtered text[] := '{}';
  t text;
begin
  foreach t in array coalesce(raw_tasks, '{}'::text[])
  loop
    if t = 'admin' then
      if private.is_top_admin(caller) then
        filtered := array_append(filtered, t);
      end if;
      continue;
    end if;
    if t = 'site_manager' then
      if private.is_top_admin(caller) or private.is_admin_code(caller.staff_code) then
        filtered := array_append(filtered, t);
      end if;
      continue;
    end if;
    if t = any (allowed) and private.caller_has_job(caller, t) then
      filtered := array_append(filtered, t);
    end if;
  end loop;

  select coalesce(array_agg(distinct x), '{}'::text[])
    into filtered
  from unnest(filtered) as x;

  return filtered;
end;
$$;

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
  stored_level integer;
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

  if 'admin' = any (coalesce(p_admin_tasks, '{}'::text[]))
     and not private.is_top_admin(caller) then
    raise exception 'You cannot assign Admin.';
  end if;

  if 'site_manager' = any (coalesce(p_admin_tasks, '{}'::text[]))
     and not (
       private.is_top_admin(caller)
       or private.is_admin_code(caller.staff_code)
     ) then
    raise exception 'You cannot assign Site manager.';
  end if;

  tasks := private.normalize_admin_tasks(p_admin_tasks, caller, null);
  if coalesce(array_length(tasks, 1), 0) = 0 then
    raise exception 'Assign at least one job or function';
  end if;

  staff_code_clean := private.reserve_staff_code(tasks, p_user_id);
  stored_level := case
    when lower(staff_code_clean) = 'admin 001' then 1
    else null
  end;

  update public.profiles
  set is_admin = true,
      admin_level = stored_level,
      admin_seat = null,
      staff_code = staff_code_clean,
      admin_tasks = tasks,
      staff_status = 'active',
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'kind', 'attach_staff',
    'user_id', p_user_id,
    'staff_code', staff_code_clean,
    'admin_level', stored_level,
    'admin_seat', null,
    'admin_tasks', to_jsonb(tasks)
  );
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (
      select p.is_admin
        and coalesce(p.staff_status, 'active') not in ('closed', 'suspended')
        and private.current_session_role() = 'admin'
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

create or replace function private.set_login_session_role(desired text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  role_clean text;
  me public.profiles%rowtype;
  has_member boolean;
  has_staff boolean;
  sid uuid;
  staff_state text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  role_clean := lower(trim(coalesce(desired, '')));
  if role_clean not in ('member', 'admin') then
    raise exception 'Session role must be member or admin';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;

  has_member := me.member_id is not null and length(trim(me.member_id)) > 0;
  has_staff := coalesce(me.is_admin, false)
    or nullif(btrim(coalesce(me.staff_code, '')), '') is not null;
  staff_state := coalesce(nullif(btrim(coalesce(me.staff_status, '')), ''), 'active');

  if role_clean = 'member' then
    if not has_member then
      raise exception 'This account does not have membership. Use Admin Sign In for staff.';
    end if;
    if me.account_status in ('suspended', 'closed') then
      raise exception 'This member account is closed or suspended. Contact the office.';
    end if;
    if me.account_status not in ('active', 'pending_activation') then
      raise exception 'This member account is not active. Contact the office.';
    end if;
  else
    if not has_staff then
      raise exception 'This account does not have administrator access.';
    end if;
    if staff_state in ('suspended', 'closed') then
      raise exception 'This staff account is closed or suspended. Contact the office.';
    end if;
  end if;

  sid := private.jwt_session_id();

  insert into private.login_sessions (user_id, session_id, session_role)
  values (auth.uid(), sid, role_clean)
  on conflict (user_id, session_id) do update
    set session_role = excluded.session_role,
        updated_at = now();

  return role_clean;
end;
$$;

create or replace function public.resolve_admin_login(identifier text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  id_clean text;
  found_email text;
begin
  id_clean := lower(trim(coalesce(identifier, '')));
  if id_clean = '' then
    return null;
  end if;

  select p.email into found_email
  from public.profiles p
  where (
      p.is_admin = true
      or nullif(btrim(coalesce(p.staff_code, '')), '') is not null
    )
    and p.email is not null
    and (
      lower(p.email) = id_clean
      or lower(btrim(coalesce(p.staff_code, ''))) = id_clean
    )
  limit 1;

  return found_email;
end;
$$;

create or replace function public.clear_must_change_password()
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.profiles
  set must_change_password = false,
      account_status = case
        when account_status = 'pending_activation' then 'active'
        else account_status
      end,
      staff_status = case
        when staff_status = 'pending_activation' then 'active'
        else staff_status
      end,
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.clear_must_change_password() from public;
revoke all on function public.clear_must_change_password() from anon;
grant execute on function public.clear_must_change_password() to authenticated, service_role;

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if jwt_role = 'service_role'
     or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.is_admin := false;
      new.admin_level := null;
      new.admin_seat := null;
      new.staff_code := null;
      new.admin_tasks := '{}'::text[];
      new.member_id := null;
      new.account_kind := 'member';
      new.staff_status := null;
      if new.account_status is null
         or new.account_status not in ('pending_activation', 'active') then
        new.account_status := 'active';
      end if;
      new.must_change_password := coalesce(new.must_change_password, false);
    end if;
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  new.is_admin := old.is_admin;
  new.admin_level := old.admin_level;
  new.admin_seat := old.admin_seat;
  new.staff_code := old.staff_code;
  new.admin_tasks := old.admin_tasks;
  new.member_id := old.member_id;
  new.account_kind := old.account_kind;
  new.account_status := old.account_status;
  new.staff_status := old.staff_status;
  new.must_change_password := old.must_change_password;

  return new;
end;
$$;

-- Open a side that is not blocked. Fully blocked accounts stay banned.
update auth.users u
set banned_until = null
from public.profiles p
where u.id = p.id
  and u.banned_until is not null
  and (
    (
      nullif(btrim(coalesce(p.member_id, '')), '') is not null
      and (
        coalesce(p.is_admin, false)
        or nullif(btrim(coalesce(p.staff_code, '')), '') is not null
      )
      and (
        coalesce(p.account_status, 'active') not in ('closed', 'suspended')
        or coalesce(p.staff_status, 'active') not in ('closed', 'suspended')
      )
    )
    or (
      nullif(btrim(coalesce(p.member_id, '')), '') is null
      and (
        coalesce(p.is_admin, false)
        or nullif(btrim(coalesce(p.staff_code, '')), '') is not null
      )
      and coalesce(p.staff_status, 'active') not in ('closed', 'suspended')
    )
    or (
      nullif(btrim(coalesce(p.member_id, '')), '') is not null
      and not coalesce(p.is_admin, false)
      and nullif(btrim(coalesce(p.staff_code, '')), '') is null
      and coalesce(p.account_status, 'active') not in ('closed', 'suspended')
    )
  );
