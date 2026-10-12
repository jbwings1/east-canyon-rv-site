-- Keep the previous task names assignable so a staff save from the
-- current site still sticks. New job names are accepted as well.

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
    'members',
    'passwords',
    'reservations_view',
    'reservations_manage',
    'website',
    'staff',
    'account_roles'
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
