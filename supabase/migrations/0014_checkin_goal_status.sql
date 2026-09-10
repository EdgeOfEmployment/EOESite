-- Data-only migration: existing checkin_posts.goals entries only have a
-- `completed: boolean` field. Convert them to the new `status` string
-- ('todo' | 'partial' | 'done') so the app's runtime code (which no longer
-- reads `completed`) keeps working for posts created before this change.
update checkin_posts
set goals = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'body', g->>'body',
        'status', case when (g->>'completed')::boolean then 'done' else 'todo' end,
        'completedAt', g->'completedAt'
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(goals) as g
)
where goals is not null and jsonb_array_length(goals) > 0;
