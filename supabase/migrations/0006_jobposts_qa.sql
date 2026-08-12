alter table job_posts add column questions jsonb not null default '[]'::jsonb;
alter table job_posts drop column cover_letter_text;
alter table job_posts alter column questions drop default;
