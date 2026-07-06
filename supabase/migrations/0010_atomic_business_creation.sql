-- Phase 7 hardening — atomic business + owner creation.
--
-- app/api/onboarding/create-business/route.ts previously did two sequential
-- inserts (businesses, then business_users) with a manual compensating delete
-- if the second insert failed. That covers an insert *error*, but not a
-- process crash/timeout between the two calls — a narrow window where an
-- orphaned, ownerless business could be left behind. Wrapping both inserts in
-- one Postgres function makes them atomic: the function body runs in a single
-- transaction, so a crash mid-function rolls back everything, not just leaves
-- the first insert committed.
--
-- Runs as SECURITY INVOKER (the default) — no elevated privileges needed,
-- since the only caller is the service-role client, which already has full
-- table grants (0005_grants.sql). EXECUTE is explicitly restricted to
-- service_role: 0005's default-privilege grant would otherwise also expose
-- this to `anon`/`authenticated` over PostgREST's RPC endpoint, which would
-- let an unauthenticated caller create arbitrary tenants.
create function public.create_business_with_owner(
  p_name text,
  p_owner_email text,
  p_service_area text,
  p_services jsonb,
  p_hours jsonb,
  p_emergency_policy text,
  p_raw_scraped_content text
)
returns uuid
language plpgsql
as $$
declare
  v_business_id uuid;
begin
  insert into public.businesses (
    name, owner_email, service_area, services, hours,
    emergency_policy, raw_scraped_content, status
  ) values (
    p_name, p_owner_email, p_service_area, p_services, p_hours,
    p_emergency_policy, p_raw_scraped_content, 'trial'
  )
  returning id into v_business_id;

  insert into public.business_users (business_id, email, role, auth_user_id)
  values (v_business_id, p_owner_email, 'owner', null);

  return v_business_id;
end;
$$;

revoke execute on function public.create_business_with_owner(
  text, text, text, jsonb, jsonb, text, text
) from public, anon, authenticated;

grant execute on function public.create_business_with_owner(
  text, text, text, jsonb, jsonb, text, text
) to service_role;
