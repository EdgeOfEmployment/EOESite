create type checkin_type as enum ('wake', 'study', 'goal');

create table checkin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type checkin_type not null,
  photo_url text,
  body text not null,
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

insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

create policy "Approved members can upload checkin photos"
  on storage.objects for insert
  with check (
    bucket_id = 'checkin-photos'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Anyone can view checkin photos"
  on storage.objects for select
  using (bucket_id = 'checkin-photos');
