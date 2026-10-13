-- Status word for the sign-in door a person just tried.
-- Closed and suspended accounts cannot get a session, so the client cannot
-- read the profile row. This returns only suspended, closed, or none.
-- Pending activation is none so a temporary password can still sign in.

create or replace function public.sign_in_block_status(identifier text, door text)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  id_clean text;
  door_clean text;
  found_status text;
begin
  id_clean := lower(btrim(coalesce(identifier, '')));
  door_clean := lower(btrim(coalesce(door, '')));
  if id_clean = ''
     or char_length(id_clean) > 320
     or door_clean not in ('member', 'staff') then
    return 'none';
  end if;

  if door_clean = 'member' then
    select case
             when lower(btrim(coalesce(p.account_status, ''))) in ('suspended', 'closed')
               then lower(btrim(p.account_status))
             else 'none'
           end
      into found_status
    from public.profiles p
    where nullif(btrim(coalesce(p.member_id, '')), '') is not null
      and (
        lower(btrim(coalesce(p.email, ''))) = id_clean
        or lower(btrim(coalesce(p.username, ''))) = id_clean
        or lower(btrim(coalesce(p.member_id, ''))) = id_clean
      )
    order by case
               when lower(btrim(coalesce(p.account_status, ''))) in ('suspended', 'closed') then 0
               else 1
             end
    limit 1;
  else
    select case
             when side.side_status in ('suspended', 'closed') then side.side_status
             else 'none'
           end
      into found_status
    from (
      select case
               when nullif(btrim(coalesce(p.staff_status, '')), '') is not null
                 then lower(btrim(p.staff_status))
               when nullif(btrim(coalesce(p.member_id, '')), '') is null
                 then lower(coalesce(nullif(btrim(p.account_status), ''), 'active'))
               when lower(btrim(coalesce(p.account_status, ''))) = 'pending_activation'
                 then 'pending_activation'
               else 'active'
             end as side_status
      from public.profiles p
      where (
          coalesce(p.is_admin, false)
          or nullif(btrim(coalesce(p.staff_code, '')), '') is not null
        )
        and (
          lower(btrim(coalesce(p.email, ''))) = id_clean
          or lower(btrim(coalesce(p.staff_code, ''))) = id_clean
        )
    ) as side
    order by case
               when side.side_status in ('suspended', 'closed') then 0
               else 1
             end
    limit 1;
  end if;

  if found_status in ('suspended', 'closed') then
    return found_status;
  end if;
  return 'none';
end;
$$;

comment on function public.sign_in_block_status(text, text) is
  'Status word for one sign-in door (suspended, closed, or none) matched by the identifier the person typed. Does not return passwords, emails, or tasks.';

revoke all on function public.sign_in_block_status(text, text) from public;
revoke all on function public.sign_in_block_status(text, text) from anon, authenticated;
grant execute on function public.sign_in_block_status(text, text) to anon, authenticated;
