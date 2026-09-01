-- WARNING: destructive migration. This drops all existing checkin_posts/checkin_comments/
-- checkin_reactions data and recreates the schema for the single-type "10시 인증" post model.
-- Confirmed with the product owner as an intentional, one-time data reset — do not run
-- against a database whose existing checkin history needs to be preserved.
drop table if exists checkin_reactions cascade;
drop table if exists checkin_comments cascade;
drop table if exists checkin_posts cascade;
drop type if exists checkin_type;

create table checkin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  photo_url text not null,
  goals jsonb not null default '[]'::jsonb,
  is_late boolean not null default false,
  fine_amount integer not null default 0,
  created_at timestamptz not null default now()
);

create table checkin_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references checkin_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table checkin_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references checkin_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_id, emoji)
);

alter table checkin_posts enable row level security;
alter table checkin_comments enable row level security;
alter table checkin_reactions enable row level security;

create policy "Approved members can read checkin posts"
  on checkin_posts for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin posts"
  on checkin_posts for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Authors can update their own checkin posts"
  on checkin_posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Admins can delete checkin posts"
  on checkin_posts for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Approved members can read checkin comments"
  on checkin_comments for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin comments"
  on checkin_comments for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Approved members can read checkin reactions"
  on checkin_reactions for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin reactions"
  on checkin_reactions for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Members can delete own checkin reactions"
  on checkin_reactions for delete
  using (author_id = auth.uid());
