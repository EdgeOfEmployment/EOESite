alter table profiles add column github_username text;

-- security-definer RPC so a member can update only their own
-- github_username, never role/status/other columns or other rows —
-- same pattern as is_admin()/is_approved() in prior migrations.
create function public.update_own_github_username(new_username text)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set github_username = new_username where id = auth.uid();
$$;

grant execute on function public.update_own_github_username(text) to authenticated;

alter table coding_problems add column match_keyword text;
