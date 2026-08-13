drop policy "Members can create own coding checks" on coding_checks;
drop policy "Members can delete own coding checks" on coding_checks;

create policy "Admins can delete coding checks"
  on coding_checks for delete
  using (public.is_admin());
