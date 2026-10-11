-- Test member charges. The office accounting software is not connected.
-- Payments recorded here are test payments only.

create sequence if not exists public.member_invoice_number_seq start with 1001;

create table if not exists public.member_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_id text not null,
  member_name text not null,
  charge_type text not null,
  description text not null,
  amount numeric(10,2) not null,
  due_date date not null,
  status text not null default 'open',
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid,
  created_by_name text not null,
  paid_at timestamptz,
  paid_amount numeric(10,2),
  payment_kind text,
  constraint member_invoices_charge_type_check
    check (charge_type in ('annual_dues', 'penalty', 'other')),
  constraint member_invoices_status_check
    check (status in ('open', 'paid')),
  constraint member_invoices_amount_check
    check (amount > 0),
  constraint member_invoices_description_check
    check (char_length(btrim(description)) > 0)
);

create index if not exists member_invoices_user_status_idx
  on public.member_invoices (user_id, status, due_date);

comment on table public.member_invoices is
  'Member charges for the test account. payment_kind test means no card was charged.';

alter table public.member_invoices enable row level security;

revoke all on public.member_invoices from anon, authenticated;
grant select on public.member_invoices to authenticated;

drop policy if exists member_invoices_select on public.member_invoices;
create policy member_invoices_select
  on public.member_invoices
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_admin_task('reservations_manage')
  );

create or replace function private.member_has_overdue_invoice(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.member_invoices i
    where i.user_id = p_user_id
      and i.status = 'open'
      and i.due_date < (pg_catalog.timezone('America/Denver', pg_catalog.now()))::date
  );
$$;

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
    coalesce(nullif(btrim(admin.full_name), ''), nullif(btrim(admin.email), ''), 'Admin')
  )
  returning * into created;

  return created;
end;
$$;

create or replace function private.pay_own_invoice(p_invoice_id uuid)
returns public.member_invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  paid public.member_invoices;
begin
  if auth.uid() is null then
    raise exception 'Sign in to pay.';
  end if;

  update public.member_invoices
  set status = 'paid',
      paid_at = pg_catalog.now(),
      paid_amount = amount,
      payment_kind = 'test'
  where id = p_invoice_id
    and user_id = auth.uid()
    and status = 'open'
  returning * into paid;

  if paid.id is null then
    raise exception 'That invoice is not open on your account.';
  end if;

  return paid;
end;
$$;

create or replace function public.create_member_invoice(
  p_user_id uuid,
  p_charge_type text,
  p_description text,
  p_amount numeric,
  p_due_date date
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.to_jsonb(private.create_member_invoice(
    p_user_id,
    p_charge_type,
    p_description,
    p_amount,
    p_due_date
  ));
$$;

create or replace function public.pay_own_invoice(p_invoice_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.to_jsonb(private.pay_own_invoice(p_invoice_id));
$$;

revoke all on function private.member_has_overdue_invoice(uuid) from public;
revoke all on function private.create_member_invoice(uuid, text, text, numeric, date) from public;
revoke all on function private.pay_own_invoice(uuid) from public;
revoke all on function public.create_member_invoice(uuid, text, text, numeric, date) from public;
revoke all on function public.pay_own_invoice(uuid) from public;

grant execute on function private.member_has_overdue_invoice(uuid) to authenticated;
grant execute on function private.create_member_invoice(uuid, text, text, numeric, date) to authenticated;
grant execute on function private.pay_own_invoice(uuid) to authenticated;
grant execute on function public.create_member_invoice(uuid, text, text, numeric, date) to authenticated;
grant execute on function public.pay_own_invoice(uuid) to authenticated;

create or replace function private.reject_overdue_member_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.booked_by_kind = 'member'
     and private.member_has_overdue_invoice(new.user_id) then
    raise exception 'Your account is overdue. Pay the open charge before booking.';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_reject_overdue_member on public.bookings;
create trigger bookings_reject_overdue_member
  before insert on public.bookings
  for each row
  execute function private.reject_overdue_member_booking();

revoke all on function private.reject_overdue_member_booking() from public;
