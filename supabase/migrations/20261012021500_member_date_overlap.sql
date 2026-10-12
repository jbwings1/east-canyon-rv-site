-- A member cannot hold two confirmed or active stays on overlapping dates.
-- This applies to members and admins. There is no override.

create or replace function public.bookings_prevent_member_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('confirmed', 'active')
     and new.user_id is not null
     and new.check_in is not null
     and new.check_out is not null then
    if exists (
      select 1
      from public.bookings b
      where b.status in ('confirmed', 'active')
        and b.user_id = new.user_id
        and b.id is distinct from new.id
        and public.dates_overlap(new.check_in, new.check_out, b.check_in, b.check_out)
    ) then
      raise exception 'A member cannot have two spots in the same time frame.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_prevent_member_overlap on public.bookings;
create trigger bookings_prevent_member_overlap
  before insert or update of user_id, check_in, check_out, status
  on public.bookings
  for each row
  execute function public.bookings_prevent_member_overlap();
