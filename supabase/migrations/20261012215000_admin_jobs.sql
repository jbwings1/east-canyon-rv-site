-- Six assignable jobs: front desk, reservation agent, special events,
-- website editor, accounts manager, and site manager.
-- Older task names still grant the job they were folded into.

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
begin
  if caller.admin_level = 1 or site_manager then
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
    when 'staff' then 'staff' = any (tasks)
    when 'account_roles' then 'account_roles' = any (tasks)
    when 'site_manager' then false
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
        and private.caller_has_job(p, task)
      from public.profiles p
      where p.id = auth.uid()
    ),
    false
  );
$$;

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

create or replace function private.assert_account_roles()
returns public.profiles
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  caller public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into caller from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Admin profile not found';
  end if;

  if not public.has_admin_task('account_roles') then
    raise exception 'You are not assigned the Site manager job';
  end if;

  return caller;
end;
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

-- Member charges: accounts managers create them.
-- Reservation agents can still read charges so overdue booking rules work.
drop policy if exists member_invoices_select on public.member_invoices;
create policy member_invoices_select
  on public.member_invoices
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_admin_task('reservations_manage')
    or public.has_admin_task('accounts_manager')
  );

create or replace function private.create_member_invoice(
  p_user_id uuid,
  p_charge_type text,
  p_description text,
  p_amount numeric,
  p_due_date date
)
returns public.member_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.profiles;
  admin public.profiles;
  created public.member_invoices;
  cleaned_description text := btrim(coalesce(p_description, ''));
  cleaned_type text := btrim(coalesce(p_charge_type, ''));
  cleaned_amount numeric(10,2);
  admin_name text;
  admin_number text;
begin
  if not public.has_admin_task('accounts_manager') then
    raise exception 'You are not assigned the Accounts manager job.';
  end if;

  if cleaned_type not in ('annual_dues', 'penalty', 'other') then
    raise exception 'Choose a charge type.';
  end if;
  if cleaned_description = '' then
    raise exception 'Enter a description.';
  end if;
  if char_length(cleaned_description) > 500 then
    raise exception 'Description must be 500 characters or less.';
  end if;
  if p_due_date is null then
    raise exception 'Enter a due date.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  cleaned_amount := round(p_amount, 2);

  select * into member from public.profiles where id = p_user_id;
  if member.id is null then
    raise exception 'Choose a member.';
  end if;
  if coalesce(btrim(member.member_id), '') = '' then
    raise exception 'That account is not a member.';
  end if;
  if member.account_status = 'closed' then
    raise exception 'Closed members are not billed here.';
  end if;

  select * into admin from public.profiles where id = auth.uid();
  admin_name := coalesce(nullif(btrim(admin.full_name), ''), nullif(btrim(admin.email), ''), 'Admin');
  admin_number := coalesce(
    nullif(btrim(admin.staff_code), ''),
    case
      when admin.admin_level is not null then admin.admin_level::text || coalesce(admin.admin_seat, '')
      else null
    end
  );

  insert into public.member_invoices (
    invoice_number,
    user_id,
    member_id,
    member_name,
    charge_type,
    description,
    amount,
    due_date,
    status,
    created_by,
    created_by_name
  ) values (
    'INV-' || pg_catalog.lpad(pg_catalog.nextval('public.member_invoice_number_seq')::text, 4, '0'),
    member.id,
    btrim(member.member_id),
    coalesce(nullif(btrim(member.full_name), ''), member.email, 'Member'),
    cleaned_type,
    cleaned_description,
    cleaned_amount,
    p_due_date,
    'open',
    auth.uid(),
    case
      when admin_number is not null and admin_number <> '' and admin_number <> admin_name
        then admin_name || ' (' || admin_number || ')'
      else admin_name
    end
  )
  returning * into created;

  return created;
end;
$$;

-- Alert delete is site manager only. Website editors can still add and edit.
drop policy if exists "Admins can manage alerts" on public.site_alerts;

create policy site_alerts_insert
  on public.site_alerts
  for insert
  to authenticated
  with check (public.has_admin_task('website'));

create policy site_alerts_update
  on public.site_alerts
  for update
  to authenticated
  using (public.has_admin_task('website'))
  with check (public.has_admin_task('website'));

create policy site_alerts_delete
  on public.site_alerts
  for delete
  to authenticated
  using (public.has_admin_task('site_manager'));

-- Special events mark calendar days. The old Website task still includes that.
drop policy if exists wedding_calendar_days_insert on public.wedding_calendar_days;
drop policy if exists wedding_calendar_days_update on public.wedding_calendar_days;
drop policy if exists wedding_calendar_days_delete on public.wedding_calendar_days;

create policy wedding_calendar_days_insert
  on public.wedding_calendar_days
  for insert
  to authenticated
  with check (public.has_admin_task('special_events'));

create policy wedding_calendar_days_update
  on public.wedding_calendar_days
  for update
  to authenticated
  using (public.has_admin_task('special_events'))
  with check (public.has_admin_task('special_events'));

create policy wedding_calendar_days_delete
  on public.wedding_calendar_days
  for delete
  to authenticated
  using (public.has_admin_task('special_events'));

-- Heading and display year are site manager only. The public note stays with website editors.
create or replace function private.guard_wedding_calendar_settings()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.has_admin_task('site_manager') then
      raise exception 'Only a site manager can create booking calendar settings.';
    end if;
    return new;
  end if;

  if not public.has_admin_task('website') and not public.has_admin_task('site_manager') then
    raise exception 'You cannot change the booking calendar page.';
  end if;

  if not public.has_admin_task('site_manager') then
    if new.heading is distinct from old.heading
       or new.display_year is distinct from old.display_year then
      raise exception 'Only a site manager can change the booking calendar heading or year.';
    end if;
  end if;

  if new.note is distinct from old.note
     and not public.has_admin_task('website') then
    raise exception 'Only a website editor can change the public booking calendar note.';
  end if;

  return new;
end;
$$;

drop trigger if exists wedding_calendar_settings_guard on public.wedding_calendar_settings;
create trigger wedding_calendar_settings_guard
  before insert or update on public.wedding_calendar_settings
  for each row
  execute function private.guard_wedding_calendar_settings();

revoke all on function private.guard_wedding_calendar_settings() from public;
revoke all on function private.guard_wedding_calendar_settings() from anon, authenticated;

-- Names on occupied sites are for front desk (and jobs that include front desk).
create or replace function public.get_site_occupancy(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_staff boolean := public.is_admin();
  show_names boolean := public.has_admin_task('front_desk');
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'Choose a valid from and to date';
  end if;

  if not is_staff then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.member_id is not null
        and length(trim(p.member_id)) > 0
        and p.account_status in ('active', 'pending_activation')
        and private.current_session_role() = 'member'
    ) then
      raise exception 'Member access required';
    end if;
  end if;

  if show_names then
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.spot, x.check_in), '[]'::jsonb)
    into result
    from (
      select
        b.id,
        b.spot,
        b.check_in,
        b.check_out,
        b.status,
        b.notes,
        b.created_at,
        b.booked_by_kind,
        b.booked_by_name,
        b.booked_by_code,
        b.reservation_type,
        p.full_name,
        p.member_id,
        p.email,
        p.phone
      from public.bookings b
      left join public.profiles p on p.id = b.user_id
      where b.status in ('confirmed', 'active')
        and b.spot is not null
        and public.dates_overlap(p_from, p_to, b.check_in, b.check_out)
    ) x;
  else
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.spot, x.check_in), '[]'::jsonb)
    into result
    from (
      select
        b.id,
        b.spot,
        b.check_in,
        b.check_out,
        b.status
      from public.bookings b
      where b.status in ('confirmed', 'active')
        and b.spot is not null
        and public.dates_overlap(p_from, p_to, b.check_in, b.check_out)
    ) x;
  end if;

  return result;
end;
$function$;
