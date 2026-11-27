-- Admin adds an existing registered account to an org directly (ARCHITECTURE §6.5, E3 admin UI).
-- Same rules as org_join (1642) without the invite token: the org must be active, the account
-- unbanned, not an active member of another org (ORG_MEMBER_EXISTS), and without an open personal
-- affiliate account (ORG_PERSONAL_AFFILIATE). Already an active member of this org is a no-op.
-- Expand-only: one new function and one widened audit-action check; nothing existing changes.
--
-- Lock order is the spec's: org row (FOR NO KEY UPDATE) -> profile row (FOR NO KEY UPDATE).
-- Enterprise affiliate side effects are the same as org_join's, i.e. none to run here: a customer
-- referred to the org's affiliate account who becomes an active member earns the org no commission
-- on later payments, because the payment trigger voids it as 'org_member' (1643/1740) by reading
-- org_members at payment time. Nothing is written to profiles.referred_*.

alter table public.admin_audit_log drop constraint admin_audit_log_action_check,
  add constraint admin_audit_log_action_check check (action in (
  'ban_user','unban_user','view_work','replay_checkout','decide_refund','submit_dispute',
  'clawback_payment','save_code','set_code_active','affiliate_create','affiliate_decide',
  'affiliate_set','affiliate_rebind','affiliate_adjust','affiliate_commission_release',
  'affiliate_payout_decide','affiliate_settings','affiliate_recompute','waffo_renewal_settled',
  'waffo_renewal_refunded','catalog_save','catalog_prepare','catalog_publish','catalog_retry',
  'catalog_archive','catalog_waffo','gallery_setting','moderate_work','template_sync_active',
  'template_sync_sale','series_sync_active','template_apply_active','template_apply_cover',
  'series_set_active','series_set_show_members','template_delete','provider_declare_tiers',
  'series_delete','series_sync_delete',
  'experiment_save','experiment_start','experiment_pause','experiment_resume','experiment_end',
  'experiment_archive_variant','experiment_delete',
  'blog_save','blog_publish','blog_unpublish',
  'org_create','org_update','org_grant','org_package_save',
  'org_add_member'));

-- p_input: {org_id, user_id}. Returns {"applied": true} when the account joined, false when it
-- was already an active member of this org (nothing written, no audit row).
create or replace function public.admin_org_add_member(p_actor uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_user uuid;
  o public.orgs;
  v_banned timestamptz;
  v_current uuid;
begin
  perform public._org_require_admin(p_actor);
  if p_input is null or jsonb_typeof(p_input) <> 'object'
     or coalesce(p_input->>'org_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_input->>'user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_INPUT';
  end if;
  v_org_id := (p_input->>'org_id')::uuid;
  v_user := (p_input->>'user_id')::uuid;
  select * into o from public.orgs where id = v_org_id for no key update;
  if not found then raise exception 'ORG_NOT_FOUND'; end if;
  if o.status <> 'active' then raise exception 'ORG_SUSPENDED'; end if;
  select banned_at into v_banned from public.profiles where id = v_user for no key update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_banned is not null then raise exception 'USER_BANNED'; end if;
  select org_id into v_current from public.org_members where user_id = v_user and status = 'active';
  if v_current = o.id then return jsonb_build_object('applied', false); end if;
  if v_current is not null then raise exception 'ORG_MEMBER_EXISTS'; end if;
  if public._affiliate_personal_open(v_user) then raise exception 'ORG_PERSONAL_AFFILIATE'; end if;
  insert into public.org_members(org_id, user_id, role) values (o.id, v_user, 'member')
    on conflict (org_id, user_id) do update set status = 'active', removed_at = null, joined_at = now(),
      monthly_allowance = 0, held_credits = 0;
  perform public._org_audit(p_actor, 'org_add_member', o.id::text, 'member:' || v_user::text);
  return jsonb_build_object('applied', true);
end;
$$;
revoke all on function public.admin_org_add_member(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_org_add_member(uuid, jsonb) to service_role;
