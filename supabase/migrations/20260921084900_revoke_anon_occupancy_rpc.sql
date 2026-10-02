-- get_site_occupancy requires a signed-in member/staff; revoke anon EXECUTE.
revoke all on function public.get_site_occupancy(date, date) from public;
revoke all on function public.get_site_occupancy(date, date) from anon;
grant execute on function public.get_site_occupancy(date, date) to authenticated, service_role;
