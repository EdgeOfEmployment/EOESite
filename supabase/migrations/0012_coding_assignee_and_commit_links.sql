-- Coding board: let admins target specific members per problem (empty =
-- everyone, evaluated dynamically at read time), and let the GitHub webhook
-- record the exact commit + file path that satisfied a check so the
-- check-in page can link straight to it instead of guessing a folder URL.
alter table coding_problems
  add column assignee_ids uuid[] not null default '{}';

alter table coding_checks
  add column commit_sha text,
  add column file_path text;
