-- Harden profile privilege escalation paths and SECURITY DEFINER exposure.
--
-- Critical: "Users can update own profile" previously allowed any authenticated
-- user to set is_admin / admin_tasks / member_id / account_status on their row.
-- handle_new_user also trusted editable user_metadata for those fields.

create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  -- Service role and database owners manage privileged fields directly.
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
      if new.account_status is null
         or new.account_status not in ('pending_activation', 'active') then
        new.account_status := 'active';
      end if;
      new.must_change_password := coalesce(new.must_change_password, false);
    end if;
    return new;
  end if;

  -- Admins may change privilege fields via the admin update policy.
  if public.is_admin() then
    return new;
  end if;

  -- Non-admins cannot escalate or alter membership / staff fields.
  new.is_admin := old.is_admin;
  new.admin_level := old.admin_level;
  new.admin_seat := old.admin_seat;
  new.staff_code := old.staff_code;
  new.admin_tasks := old.admin_tasks;
  new.member_id := old.member_id;
  new.account_kind := old.account_kind;
  new.account_status := old.account_status;
  new.must_change_password := old.must_change_password;

  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before insert or update on public.profiles
  for each row
  execute function private.protect_profile_privileges();

-- Never trust user-editable metadata for authorization fields.
-- Office provisioning still sets privileges via service_role profile upserts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    address,
    city,
    state,
    zip,
    member_id,
    account_kind,
    account_status,
    must_change_password,
    is_admin,
    admin_level,
    admin_seat,
    staff_code,
    admin_tasks
  ) values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    coalesce(new.raw_user_meta_data ->> 'city', ''),
    coalesce(new.raw_user_meta_data ->> 'state', ''),
    coalesce(new.raw_user_meta_data ->> 'zip', ''),
    null,
    'member',
    'active',
    false,
    false,
    null,
    null,
    null,
    '{}'::text[]
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    address = coalesce(nullif(excluded.address, ''), public.profiles.address),
    city = coalesce(nullif(excluded.city, ''), public.profiles.city),
    state = coalesce(nullif(excluded.state, ''), public.profiles.state),
    zip = coalesce(nullif(excluded.zip, ''), public.profiles.zip),
    updated_at = now();

  return new;
end;
$$;

-- Trigger-only SECURITY DEFINER helpers must not be callable via RPC.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;
revoke all on function public.enforce_booking_no_spot_overlap() from public;
revoke all on function public.enforce_booking_no_spot_overlap() from anon, authenticated;

revoke all on function public.clear_must_change_password() from public;
revoke all on function public.clear_must_change_password() from anon;
grant execute on function public.clear_must_change_password() to authenticated, service_role;

alter function public.clear_must_change_password() set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.dates_overlap(date, date, date, date) set search_path = '';
alter function public.format_booking_stay_short(date, date) set search_path = '';
alter function public.set_booking_edited_at() set search_path = '';
alter function public.set_booking_original_stay_dates() set search_path = '';
alter function public.bookings_prevent_spot_overlap() set search_path = '';
alter function public.enforce_booking_no_spot_overlap() set search_path = '';

-- Drop duplicate identical SELECT policy on site_alerts.
drop policy if exists site_alerts_select_active on public.site_alerts;
