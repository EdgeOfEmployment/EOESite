create table job_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  post_date date not null,
  company_name text not null,
  posting_info text,
  cover_letter_text text not null,
  feedback_requested boolean not null default false,
  created_at timestamptz not null default now()
);

create table job_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references job_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_id, emoji)
);

-- One snapshot per job post, created only when feedback_requested is checked
-- at post-creation time. job_posts is never updated afterward, so this
-- snapshot never needs to be regenerated or kept in sync.
create table feedback_docs (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references job_posts(id) on delete cascade,
  lines jsonb not null,
  created_at timestamptz not null default now()
);

-- parent_comment_id is self-referencing so replies can nest GitHub-PR-review
-- style; a reply always shares its parent's line_index (enforced in the
-- addFeedbackComment server action, not in the schema).
create table feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_doc_id uuid not null references feedback_docs(id) on delete cascade,
  line_index integer not null,
  parent_comment_id uuid references feedback_comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table job_posts enable row level security;
alter table job_post_reactions enable row level security;
alter table feedback_docs enable row level security;
alter table feedback_comments enable row level security;

create policy "Approved members can read job posts"
  on job_posts for select
  using (public.is_approved());

create policy "Approved members can create job posts"
  on job_posts for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "Admins can delete job posts"
  on job_posts for delete
  using (public.is_admin());

create policy "Approved members can read job post reactions"
  on job_post_reactions for select
  using (public.is_approved());

create policy "Approved members can create job post reactions"
  on job_post_reactions for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "Members can delete own job post reactions"
  on job_post_reactions for delete
  using (author_id = auth.uid());

create policy "Approved members can read feedback docs"
  on feedback_docs for select
  using (public.is_approved());

create policy "Authors can create their own feedback snapshot"
  on feedback_docs for insert
  with check (
    public.is_approved()
    and exists (select 1 from job_posts jp where jp.id = job_post_id and jp.author_id = auth.uid())
  );

create policy "Approved members can read feedback comments"
  on feedback_comments for select
  using (public.is_approved());

create policy "Approved members can create feedback comments"
  on feedback_comments for insert
  with check (author_id = auth.uid() and public.is_approved());
