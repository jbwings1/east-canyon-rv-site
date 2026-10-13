-- Assigned jobs and extra functions require an Active staff side.
-- Pending (temporary password, pending_activation, or a staff-only account
-- still pending), Suspended, and Closed cannot use those jobs.
-- Admin 001 is not exempt. is_admin() stays available for sign-in and the
-- temporary-password page; it still rejects Closed and Suspended sessions.

create or replace function private.staff_can_use_jobs(caller public.profiles)
returns boolean
language plpgsql
stable
set search_path to ''
as $$
declare
  staff_state text;
  account_state text;
  has_member boolean;
  has_staff boolean;
begin
  if caller is null then
    return false;
  end if;

  has_staff :=
    coalesce(caller.is_admin, false)
    or nullif(btrim(coalesce(caller.staff_code, '')), '') is not null
    or lower(btrim(coalesce(caller.account_kind, ''))) in ('admin', 'both');
  if not has_staff then
    return false;
  end if;

  if coalesce(caller.must_change_password, false) then
    return false;
  end if;

  has_member := caller.member_id is not null and length(btrim(caller.member_id)) > 0;
  staff_state := nullif(lower(btrim(coalesce(caller.staff_status, ''))), '');
  account_state := coalesce(nullif(lower(btrim(coalesce(caller.account_status, ''))), ''), 'active');

  if staff_state is null then
    if not has_member then
      staff_state := account_state;
    elsif account_state = 'pending_activation' then
      staff_state := 'pending_activation';
    else
      staff_state := 'active';
    end if;
  end if;

  return staff_state = 'active';
end;
$$;

revoke all on function private.staff_can_use_jobs(public.profiles) from public;
revoke all on function private.staff_can_use_jobs(public.profiles) from anon, authenticated;

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
  if not private.staff_can_use_jobs(caller) then
    return false;
  end if;

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

create or replace function public.has_admin_task(task text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    (
      select
        public.is_admin()
        and private.staff_can_use_jobs(p)
        and private.caller_has_job(p, task)
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;
