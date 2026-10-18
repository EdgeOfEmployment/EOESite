-- Problem bank (문제은행): member-authored coding problems with a typed function signature and
-- test cases, downloaded as self-grading files in C/JS/Python/Java. Unlike coding_problems, any
-- approved member can create one; only the author or an admin can edit or delete it.
-- See docs/superpowers/specs/2026-10-18-problem-bank-design.md.

create table bank_problems (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 1 and 30),
  title text not null check (char_length(title) between 1 and 100),
  description_md text not null check (char_length(description_md) between 1 and 20000),
  constraints_md text not null default '' check (char_length(constraints_md) <= 5000),
  time_limit_ms integer not null default 1000 check (time_limit_ms between 100 and 60000),
  signature jsonb not null,
  test_cases jsonb not null,
  -- Storage keys in problem-images referenced by the Markdown, so delete/edit can clean them up.
  image_paths text[] not null default '{}',
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_problems_company_idx on bank_problems (company);
create index bank_problems_created_at_idx on bank_problems (created_at desc);

alter table bank_problems enable row level security;

create policy "Approved members can read bank problems"
  on bank_problems for select
  using (public.is_approved());

create policy "Approved members can create own bank problems"
  on bank_problems for insert
  with check (created_by = auth.uid() and public.is_approved());

-- The with check repeats the using clause so an author cannot hand a row to someone else by
-- rewriting created_by; an admin edit keeps the original author because the action never sends it.
create policy "Authors and admins can update bank problems"
  on bank_problems for update
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_approved() and (created_by = auth.uid() or public.is_admin()));

create policy "Authors and admins can delete bank problems"
  on bank_problems for delete
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()));

insert into storage.buckets (id, name, public)
values ('problem-images', 'problem-images', true)
on conflict (id) do nothing;

create policy "Approved members can upload problem images to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'problem-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

create policy "Anyone can view problem images"
  on storage.objects for select
  using (bucket_id = 'problem-images');

create policy "Owners and admins can delete problem images"
  on storage.objects for delete
  using (
    bucket_id = 'problem-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
