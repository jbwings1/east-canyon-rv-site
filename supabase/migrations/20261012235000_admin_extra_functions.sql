-- Extra functions can be assigned on their own.
-- A job still includes its functions. One function does not include the rest of a job.
-- Level 1 and Site manager still include every job and every function.

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
  legacy_staff boolean := 'staff' = any (tasks);
  legacy_roles boolean := 'account_roles' = any (tasks);
  staff_functions boolean :=
    legacy_staff
    or 'create_staff' = any (tasks)
    or 'edit_staff' = any (tasks)
    or 'close_staff' = any (tasks)
    or 'add_staff_access' = any (tasks)
    or 'add_membership' = any (tasks)
    or 'remove_staff_access' = any (tasks);
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
    when 'staff' then staff_functions
    when 'account_roles' then
      legacy_roles
      or 'add_staff_access' = any (tasks)
      or 'add_membership' = any (tasks)
      or 'remove_staff_access' = any (tasks)
    when 'site_manager' then false
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
    when 'create_staff' then legacy_staff or task = any (tasks)
    when 'edit_staff' then legacy_staff or task = any (tasks)
    when 'close_staff' then legacy_staff or task = any (tasks)
    when 'add_staff_access' then legacy_roles or task = any (tasks)
    when 'add_membership' then legacy_roles or task = any (tasks)
    when 'remove_staff_access' then legacy_roles or task = any (tasks)
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

-- Callers check the specific function. add_membership must not pass attach staff.
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

  return caller;
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
  seat_clean text;
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

  seat_clean := lower(trim(coalesce(p_admin_seat, '')));
  if seat_clean = '' then
    raise exception 'Seat letter is required';
  end if;

  tasks := private.normalize_admin_tasks(p_admin_tasks, caller, p_admin_level);
  if coalesce(array_length(tasks, 1), 0) = 0 then
    raise exception 'Assign at least one job or function';
  end if;

  update public.profiles
  set is_admin = true,
      admin_level = p_admin_level,
      admin_seat = seat_clean,
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
    'admin_seat', seat_clean,
    'admin_tasks', to_jsonb(tasks)
  );
end;
$$;

create or replace function private.attach_membership(
  p_user_id uuid,
  p_member_id text,
  p_reservation_type text,
  p_full_name text,
  p_phone text,
  p_address text,
  p_city text,
  p_state text,
  p_zip text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  target public.profiles%rowtype;
  member_id_clean text;
  type_clean text;
  full_name_clean text;
  phone_clean text;
  address_clean text;
  city_clean text;
  state_clean text;
  zip_clean text;
  complete boolean;
begin
  perform private.assert_account_roles();
  if not public.has_admin_task('add_membership') then
    raise exception 'You are not assigned this function.';
  end if;

  if p_user_id is null then
    raise exception 'Staff account is required';
  end if;

  select * into target from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Staff account not found';
  end if;

  if not coalesce(target.is_admin, false)
     and (target.staff_code is null or length(trim(target.staff_code)) = 0) then
    raise exception 'Membership can only be added to an existing staff account';
  end if;

  if target.member_id is not null and length(trim(target.member_id)) > 0 then
    raise exception 'This account already has a membership';
  end if;

  member_id_clean := trim(coalesce(p_member_id, ''));
  if member_id_clean = '' then
    raise exception 'Member ID is required';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id <> p_user_id
      and p.member_id is not null
      and trim(p.member_id) = member_id_clean
  ) then
    raise exception 'That member ID is already in use';
  end if;

  type_clean := lower(trim(coalesce(p_reservation_type, '')));
  if type_clean in ('family-reunion', 'reunion') then
    type_clean := 'family_reunion';
  end if;
  if type_clean not in ('condo', 'rv', 'family_reunion') then
    raise exception 'Choose Condo, Family reunion, or RV.';
  end if;

  full_name_clean := trim(coalesce(nullif(trim(coalesce(p_full_name, '')), ''), target.full_name, ''));
  phone_clean := trim(coalesce(nullif(trim(coalesce(p_phone, '')), ''), target.phone, ''));
  address_clean := trim(coalesce(p_address, ''));
  city_clean := trim(coalesce(p_city, ''));
  state_clean := trim(coalesce(p_state, ''));
  zip_clean := trim(coalesce(p_zip, ''));

  if full_name_clean = '' or phone_clean = '' or address_clean = '' then
    raise exception 'Full name, phone, and address are required for members';
  end if;

  complete := full_name_clean <> ''
    and coalesce(target.email, '') <> ''
    and phone_clean <> ''
    and address_clean <> ''
    and city_clean <> ''
    and state_clean <> ''
    and zip_clean <> '';

  update public.profiles
  set member_id = member_id_clean,
      reservation_type = type_clean::public.reservation_type,
      full_name = full_name_clean,
      phone = phone_clean,
      address = address_clean,
      city = nullif(city_clean, ''),
      state = nullif(state_clean, ''),
      zip = nullif(zip_clean, ''),
      profile_complete = complete,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'kind', 'attach_membership',
    'user_id', p_user_id,
    'member_id', member_id_clean,
    'reservation_type', type_clean
  );
end;
$$;

drop policy if exists member_invoices_select on public.member_invoices;
create policy member_invoices_select
  on public.member_invoices
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_admin_task('override_rule')
    or public.has_admin_task('member_charges')
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
  if not public.has_admin_task('member_charges') then
    raise exception 'You are not assigned this function.';
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

drop policy if exists "Anyone can read active alerts" on public.site_alerts;
create policy "Anyone can read active alerts"
  on public.site_alerts
  for select
  to anon, authenticated
  using (
    active = true
    or public.has_admin_task('manage_alerts')
    or public.has_admin_task('alert_photos')
    or public.has_admin_task('delete_alert')
  );

drop policy if exists site_alerts_insert on public.site_alerts;
create policy site_alerts_insert
  on public.site_alerts
  for insert
  to authenticated
  with check (public.has_admin_task('manage_alerts'));

drop policy if exists site_alerts_update on public.site_alerts;
create policy site_alerts_update
  on public.site_alerts
  for update
  to authenticated
  using (public.has_admin_task('manage_alerts'))
  with check (public.has_admin_task('manage_alerts'));

drop policy if exists site_alerts_delete on public.site_alerts;
create policy site_alerts_delete
  on public.site_alerts
  for delete
  to authenticated
  using (public.has_admin_task('delete_alert'));

drop policy if exists site_alert_images_select on public.site_alert_images;
create policy site_alert_images_select
  on public.site_alert_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.site_alerts a
      where a.id = site_alert_images.alert_id
        and (
          a.active = true
          or public.has_admin_task('manage_alerts')
          or public.has_admin_task('alert_photos')
          or public.has_admin_task('delete_alert')
        )
    )
  );

drop policy if exists site_alert_images_insert on public.site_alert_images;
create policy site_alert_images_insert
  on public.site_alert_images
  for insert
  to authenticated
  with check (public.has_admin_task('alert_photos'));

drop policy if exists site_alert_images_update on public.site_alert_images;
create policy site_alert_images_update
  on public.site_alert_images
  for update
  to authenticated
  using (public.has_admin_task('alert_photos'))
  with check (public.has_admin_task('alert_photos'));

drop policy if exists site_alert_images_delete on public.site_alert_images;
create policy site_alert_images_delete
  on public.site_alert_images
  for delete
  to authenticated
  using (public.has_admin_task('alert_photos'));

drop policy if exists "Admins upload alert-images storage" on storage.objects;
create policy "Admins upload alert-images storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'alert-images'
    and public.has_admin_task('alert_photos')
  );

drop policy if exists "Admins update alert-images storage" on storage.objects;
create policy "Admins update alert-images storage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'alert-images'
    and public.has_admin_task('alert_photos')
  )
  with check (
    bucket_id = 'alert-images'
    and public.has_admin_task('alert_photos')
  );

drop policy if exists "Admins delete alert-images storage" on storage.objects;
create policy "Admins delete alert-images storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'alert-images'
    and public.has_admin_task('alert_photos')
  );

drop policy if exists "Admins can insert gallery images" on public.gallery_images;
create policy "Admins can insert gallery images"
  on public.gallery_images
  for insert
  to authenticated
  with check (public.has_admin_task('gallery'));

drop policy if exists "Admins can update gallery images" on public.gallery_images;
create policy "Admins can update gallery images"
  on public.gallery_images
  for update
  to authenticated
  using (public.has_admin_task('gallery'))
  with check (public.has_admin_task('gallery'));

drop policy if exists "Admins can delete gallery images" on public.gallery_images;
create policy "Admins can delete gallery images"
  on public.gallery_images
  for delete
  to authenticated
  using (public.has_admin_task('gallery'));

drop policy if exists gallery_sections_insert on public.gallery_sections;
create policy gallery_sections_insert
  on public.gallery_sections
  for insert
  to authenticated
  with check (public.has_admin_task('gallery'));

drop policy if exists gallery_sections_update on public.gallery_sections;
create policy gallery_sections_update
  on public.gallery_sections
  for update
  to authenticated
  using (public.has_admin_task('gallery'))
  with check (public.has_admin_task('gallery'));

drop policy if exists gallery_sections_delete on public.gallery_sections;
create policy gallery_sections_delete
  on public.gallery_sections
  for delete
  to authenticated
  using (public.has_admin_task('gallery'));

drop policy if exists "Admins upload gallery storage" on storage.objects;
create policy "Admins upload gallery storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'gallery'
    and public.has_admin_task('gallery')
  );

drop policy if exists "Admins update gallery storage" on storage.objects;
create policy "Admins update gallery storage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'gallery'
    and public.has_admin_task('gallery')
  )
  with check (
    bucket_id = 'gallery'
    and public.has_admin_task('gallery')
  );

drop policy if exists "Admins delete gallery storage" on storage.objects;
create policy "Admins delete gallery storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'gallery'
    and public.has_admin_task('gallery')
  );

drop policy if exists board_members_insert on public.board_members;
create policy board_members_insert
  on public.board_members
  for insert
  to authenticated
  with check (public.has_admin_task('board_members'));

drop policy if exists board_members_update on public.board_members;
create policy board_members_update
  on public.board_members
  for update
  to authenticated
  using (public.has_admin_task('board_members'))
  with check (public.has_admin_task('board_members'));

drop policy if exists board_members_delete on public.board_members;
create policy board_members_delete
  on public.board_members
  for delete
  to authenticated
  using (public.has_admin_task('board_members'));

drop policy if exists "Admins upload board storage" on storage.objects;
create policy "Admins upload board storage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'board'
    and public.has_admin_task('board_members')
  );

drop policy if exists "Admins update board storage" on storage.objects;
create policy "Admins update board storage"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'board'
    and public.has_admin_task('board_members')
  )
  with check (
    bucket_id = 'board'
    and public.has_admin_task('board_members')
  );

drop policy if exists "Admins delete board storage" on storage.objects;
create policy "Admins delete board storage"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'board'
    and public.has_admin_task('board_members')
  );

drop policy if exists resort_events_insert on public.resort_events;
create policy resort_events_insert
  on public.resort_events
  for insert
  to authenticated
  with check (public.has_admin_task('resort_calendar'));

drop policy if exists resort_events_update on public.resort_events;
create policy resort_events_update
  on public.resort_events
  for update
  to authenticated
  using (public.has_admin_task('resort_calendar'))
  with check (public.has_admin_task('resort_calendar'));

drop policy if exists resort_events_delete on public.resort_events;
create policy resort_events_delete
  on public.resort_events
  for delete
  to authenticated
  using (public.has_admin_task('resort_calendar'));

drop policy if exists wedding_calendar_days_insert on public.wedding_calendar_days;
create policy wedding_calendar_days_insert
  on public.wedding_calendar_days
  for insert
  to authenticated
  with check (public.has_admin_task('mark_calendar'));

drop policy if exists wedding_calendar_days_update on public.wedding_calendar_days;
create policy wedding_calendar_days_update
  on public.wedding_calendar_days
  for update
  to authenticated
  using (public.has_admin_task('mark_calendar'))
  with check (public.has_admin_task('mark_calendar'));

drop policy if exists wedding_calendar_days_delete on public.wedding_calendar_days;
create policy wedding_calendar_days_delete
  on public.wedding_calendar_days
  for delete
  to authenticated
  using (public.has_admin_task('mark_calendar'));

drop policy if exists wedding_calendar_settings_insert on public.wedding_calendar_settings;
create policy wedding_calendar_settings_insert
  on public.wedding_calendar_settings
  for insert
  to authenticated
  with check (
    public.has_admin_task('edit_calendar_note')
    or public.has_admin_task('edit_calendar_heading')
  );

drop policy if exists wedding_calendar_settings_update on public.wedding_calendar_settings;
create policy wedding_calendar_settings_update
  on public.wedding_calendar_settings
  for update
  to authenticated
  using (
    public.has_admin_task('edit_calendar_note')
    or public.has_admin_task('edit_calendar_heading')
  )
  with check (
    public.has_admin_task('edit_calendar_note')
    or public.has_admin_task('edit_calendar_heading')
  );

create or replace function private.guard_wedding_calendar_settings()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.has_admin_task('edit_calendar_heading')
       and not public.has_admin_task('edit_calendar_note') then
      raise exception 'You are not assigned this function.';
    end if;
    if not public.has_admin_task('edit_calendar_heading')
       and (new.heading is not null or new.display_year is not null) then
      raise exception 'You are not assigned this function.';
    end if;
    return new;
  end if;

  if not public.has_admin_task('edit_calendar_note')
     and not public.has_admin_task('edit_calendar_heading') then
    raise exception 'You are not assigned this function.';
  end if;

  if not public.has_admin_task('edit_calendar_heading') then
    if new.heading is distinct from old.heading
       or new.display_year is distinct from old.display_year then
      raise exception 'You are not assigned this function.';
    end if;
  end if;

  if new.note is distinct from old.note
     and not public.has_admin_task('edit_calendar_note') then
    raise exception 'You are not assigned this function.';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_wedding_calendar_settings() from public;
revoke all on function private.guard_wedding_calendar_settings() from anon, authenticated;

create or replace function public.get_site_occupancy(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_staff boolean := public.is_admin();
  show_names boolean := public.has_admin_task('occupancy_names');
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
