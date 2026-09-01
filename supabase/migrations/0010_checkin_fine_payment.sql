alter table checkin_posts
  add column paid boolean not null default false,
  add column paid_at timestamptz,
  add column paid_by uuid references profiles(id);

create policy "Admins can update checkin posts"
  on checkin_posts for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
