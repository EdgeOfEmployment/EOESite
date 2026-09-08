-- Coding board: replace the implicit, date-computed "week" (coding_problems.week_of
-- snapped to the nearest Tuesday, deadline always week_of + 6 days) with an explicit
-- coding_weeks entity that admins author directly (label + start/end date), so the
-- board can show one week at a time with real prev/next navigation instead of an
-- ever-growing stacked list. See docs/superpowers/specs/2026-09-08-coding-week-pagination-design.md.

create table coding_weeks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table coding_weeks enable row level security;

create policy "Approved members can read coding weeks"
  on coding_weeks for select
  using (public.is_approved());

create policy "Admins can create coding weeks"
  on coding_weeks for insert
  with check (public.is_admin());

alter table coding_problems add column week_id uuid references coding_weeks(id) on delete cascade;

-- Backfill: one coding_weeks row per distinct prior week_of, preserving the exact
-- label/date-range every admin and member currently sees (formatWeekLabel's "M/D 주차"
-- and week_of + 6 days), so nothing changes for existing data until an admin creates
-- a new week the new way.
insert into coding_weeks (label, start_date, end_date, created_by, created_at)
select
  trim(leading '0' from to_char(week_of, 'MM')) || '/' || trim(leading '0' from to_char(week_of, 'DD')) || ' 주차',
  week_of,
  week_of + 6,
  (array_agg(created_by order by created_at))[1],
  min(created_at)
from coding_problems
group by week_of;

update coding_problems cp
set week_id = cw.id
from coding_weeks cw
where cp.week_of = cw.start_date;

alter table coding_problems alter column week_id set not null;
alter table coding_problems drop column week_of;
