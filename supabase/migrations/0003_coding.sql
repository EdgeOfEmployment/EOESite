-- Fix: only the row owner or an admin could read a profile (see
-- 0001_init.sql). Non-admin approved members couldn't read each other's
-- names, which the checkin board relies on for author/comment names and
-- the dashboard status table. Add a security-definer helper (same pattern
-- as is_admin()) and a policy so any approved member can read all profiles.
create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

create policy "Approved members can read all profiles"
  on profiles for select
  using (public.is_approved());

create table coding_problems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  link text not null,
  week_of date not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table coding_checks (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references coding_problems(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  checked_at timestamptz not null default now(),
  unique (problem_id, user_id)
);

alter table coding_problems enable row level security;
alter table coding_checks enable row level security;

create policy "Approved members can read coding problems"
  on coding_problems for select
  using (public.is_approved());

create policy "Admins can create coding problems"
  on coding_problems for insert
  with check (public.is_admin());

create policy "Admins can delete coding problems"
  on coding_problems for delete
  using (public.is_admin());

create policy "Approved members can read coding checks"
  on coding_checks for select
  using (public.is_approved());

create policy "Members can create own coding checks"
  on coding_checks for insert
  with check (user_id = auth.uid() and public.is_approved());

create policy "Members can delete own coding checks"
  on coding_checks for delete
  using (user_id = auth.uid());
