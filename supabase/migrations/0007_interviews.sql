create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  session_at timestamptz not null,
  description text,
  created_at timestamptz not null default now()
);

create table interview_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table interview_qas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

alter table interview_sessions enable row level security;
alter table interview_participants enable row level security;
alter table interview_qas enable row level security;

create policy "Approved members can read interview sessions"
  on interview_sessions for select
  using (public.is_approved());

create policy "Approved members can create interview sessions"
  on interview_sessions for insert
  with check (created_by = auth.uid() and public.is_approved());

create policy "Session creators and admins can delete interview sessions"
  on interview_sessions for delete
  using (created_by = auth.uid() or public.is_admin());

create policy "Approved members can read interview participants"
  on interview_participants for select
  using (public.is_approved());

create policy "Approved members can create interview participants"
  on interview_participants for insert
  with check (user_id = auth.uid() and public.is_approved());

create policy "Members can delete own interview participation"
  on interview_participants for delete
  using (user_id = auth.uid());

create policy "Approved members can read interview qas"
  on interview_qas for select
  using (public.is_approved());

create policy "Approved members can create interview qas"
  on interview_qas for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "QA authors and admins can delete interview qas"
  on interview_qas for delete
  using (author_id = auth.uid() or public.is_admin());

-- Generalize feedback_docs: previously always attached to a job_posts row,
-- now optionally attached to an interview_qas row instead (exactly one of
-- the two parent columns is set).
alter table feedback_docs alter column job_post_id drop not null;
alter table feedback_docs add column interview_qa_id uuid references interview_qas(id) on delete cascade unique;
alter table feedback_docs add constraint feedback_docs_exactly_one_parent check (
  (job_post_id is not null and interview_qa_id is null) or
  (job_post_id is null and interview_qa_id is not null)
);

drop policy "Authors can create their own feedback snapshot" on feedback_docs;

create policy "Authors can create their own feedback snapshot"
  on feedback_docs for insert
  with check (
    public.is_approved()
    and (
      exists (select 1 from job_posts jp where jp.id = job_post_id and jp.author_id = auth.uid())
      or exists (select 1 from interview_qas iq where iq.id = interview_qa_id and iq.author_id = auth.uid())
    )
  );
