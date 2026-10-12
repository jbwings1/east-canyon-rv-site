-- Keep the admin number (staff code) with the admin name on bookings,
-- overrides, invoices, and office check-in notes.

alter table public.bookings
  add column if not exists booked_by_name text,
  add column if not exists booked_by_code text;

comment on column public.bookings.booked_by_name is
  'Name of the person who created the stay. Set for admin bookings.';
comment on column public.bookings.booked_by_code is
  'Admin number (staff code) of the admin who created the stay.';

update public.bookings b
set
  booked_by_name = coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Admin'),
  booked_by_code = coalesce(
    nullif(btrim(p.staff_code), ''),
    case
      when p.admin_level is not null then p.admin_level::text || coalesce(p.admin_seat, '')
      else null
    end
  )
from public.profiles p
where b.booked_by_kind = 'admin'
  and b.booked_by_user_id = p.id
  and (
    b.booked_by_name is distinct from coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Admin')
    or b.booked_by_code is distinct from coalesce(
      nullif(btrim(p.staff_code), ''),
      case
        when p.admin_level is not null then p.admin_level::text || coalesce(p.admin_seat, '')
        else null
      end
    )
  );

update public.bookings b
set rule_overrides = fixed.overrides
from (
  select
    b2.id,
    jsonb_agg(
      case
        when p.id is null then elem.item
        else elem.item || jsonb_build_object(
          'by', coalesce(
            nullif(btrim(p.staff_code), ''),
            case
              when p.admin_level is not null then p.admin_level::text || coalesce(p.admin_seat, '')
              else nullif(btrim(elem.item->>'by'), '')
            end,
            ''
          ),
          'by_name', coalesce(
            nullif(btrim(p.full_name), ''),
            nullif(btrim(elem.item->>'by_name'), ''),
            nullif(btrim(p.email), ''),
            'Admin'
          )
        )
      end
      order by elem.ord
    ) as overrides
  from public.bookings b2
  cross join lateral jsonb_array_elements(b2.rule_overrides) with ordinality as elem(item, ord)
  left join lateral (
    select p.*
    from public.profiles p
    where nullif(btrim(coalesce(elem.item->>'by', '')), '') is not null
      and (
        p.id::text = elem.item->>'by'
        or (
          nullif(btrim(coalesce(p.staff_code, '')), '') is not null
          and lower(btrim(p.staff_code)) = lower(btrim(elem.item->>'by'))
        )
        or (
          nullif(btrim(coalesce(p.email, '')), '') is not null
          and lower(btrim(p.email)) = lower(btrim(elem.item->>'by'))
        )
      )
    order by
      case
        when p.id::text = elem.item->>'by' then 0
        when lower(btrim(coalesce(p.staff_code, ''))) = lower(btrim(coalesce(elem.item->>'by', ''))) then 1
        else 2
      end
    limit 1
  ) p on true
  where jsonb_typeof(b2.rule_overrides) = 'array'
    and jsonb_array_length(b2.rule_overrides) > 0
  group by b2.id
) fixed
where b.id = fixed.id
  and b.rule_overrides is distinct from fixed.overrides;

update public.bookings b
set last_edit_summary =
  'Office check-in by '
  || coalesce(nullif(btrim(p.full_name), ''), 'Admin')
  || ' ('
  || btrim(p.staff_code)
  || ')'
from public.profiles p
where b.office_checked_in_by = p.id
  and b.last_edit_summary like 'Office check-in by %'
  and nullif(btrim(p.staff_code), '') is not null
  and position('(' || btrim(p.staff_code) || ')' in b.last_edit_summary) = 0;

update public.member_invoices i
set created_by_name =
  coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(i.created_by_name), ''), 'Admin')
  || ' ('
  || btrim(p.staff_code)
  || ')'
from public.profiles p
where i.created_by = p.id
  and nullif(btrim(p.staff_code), '') is not null
  and position('(' || btrim(p.staff_code) || ')' in coalesce(i.created_by_name, '')) = 0;

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
  if not public.has_admin_task('reservations_manage') then
    raise exception 'You are not assigned the Reservations manage task.';
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

create or replace function public.get_site_occupancy(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_staff boolean := public.is_admin();
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

  if is_staff then
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
