create type user_status as enum ('pending', 'approved', 'rejected');
create type user_role as enum ('member', 'admin');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  status user_status not null default 'pending',
  role user_role not null default 'member',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "Admins can read all profiles"
  on profiles for select
  using (public.is_admin());

create policy "Admins can update any profile"
  on profiles for update
  using (public.is_admin());

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, status, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''), 'pending', 'member');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
