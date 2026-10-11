-- Members cannot book an overlapping site.
-- An admin can save that stay only when the row records a site_overlap override.

create or replace function public.bookings_prevent_spot_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('confirmed', 'active')
     and new.spot is not null
     and new.check_in is not null
     and new.check_out is not null then
    if exists (
      select 1
      from public.bookings b
      where b.status in ('confirmed', 'active')
        and b.spot = new.spot
        and b.id is distinct from new.id
        and public.dates_overlap(new.check_in, new.check_out, b.check_in, b.check_out)
    ) then
      if public.is_admin()
         and exists (
           select 1
           from jsonb_array_elements(coalesce(new.rule_overrides, '[]'::jsonb)) elem
           where elem->>'rule' = 'site_overlap'
         )
      then
        return new;
      end if;
      raise exception 'That site is already booked for overlapping dates.';
    end if;
  end if;
  return new;
end;
$$;
