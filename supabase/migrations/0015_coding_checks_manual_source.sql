alter table coding_checks
  add column source text not null default 'auto' check (source in ('auto', 'manual'));

create policy "Members can create own manual coding checks"
  on coding_checks for insert
  with check (user_id = auth.uid() and source = 'manual' and public.is_approved());

create policy "Members can delete own manual coding checks"
  on coding_checks for delete
  using (user_id = auth.uid() and source = 'manual');
