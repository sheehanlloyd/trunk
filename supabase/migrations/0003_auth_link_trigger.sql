-- Phase 1 — Invite-only account linking.
--
-- Flow: the operator pre-seeds a business_users row (email, business_id, role)
-- with auth_user_id = null. When the invited person creates their auth account
-- (sets a password) with the matching email, this trigger links their new
-- auth.users id to the pre-existing membership. If no matching invited row
-- exists, nothing happens -> the user has no business and the dashboard shows
-- a "no business associated" state. This keeps signup invite-only without any
-- app-layer privilege.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.business_users
  set auth_user_id = new.id
  where auth_user_id is null
    and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
