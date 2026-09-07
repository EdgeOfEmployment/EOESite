create table manual_fines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  paid boolean not null default false,
  paid_at timestamptz,
  paid_by uuid references profiles(id)
);

alter table manual_fines enable row level security;

create policy "Approved members can read manual fines"
  on manual_fines for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Admins can create manual fines"
  on manual_fines for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can update manual fines"
  on manual_fines for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can delete manual fines"
  on manual_fines for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
