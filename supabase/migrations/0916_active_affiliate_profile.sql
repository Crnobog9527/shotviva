create or replace function public.affiliate_save_profile(p_user uuid,p_payout_method text,p_payout_details text,p_us_person boolean,p_terms_version text)
returns void language plpgsql security definer set search_path='' as $$
declare v_version text;
begin
  select terms_version into strict v_version from public.affiliate_settings where singleton and enabled for share;
  if p_terms_version is not null and p_terms_version is distinct from v_version then raise exception 'AFFILIATE_TERMS_CHANGED'; end if;
  if (p_payout_method is null) <> (nullif(trim(p_payout_details),'') is null) then raise exception 'INVALID_INPUT'; end if;
  update public.affiliates set payout_method=p_payout_method,payout_details=nullif(trim(p_payout_details),''),
    us_person=p_us_person,terms_version=v_version,
    terms_accepted_at=case when terms_version is distinct from v_version then now() else coalesce(terms_accepted_at,now()) end
    where user_id=p_user and status='active'
      -- A maintenance-only save requires consent already recorded for the locked current version.
      and (p_terms_version is not null or (terms_version=v_version and terms_accepted_at is not null));
  if not found then raise exception 'AFFILIATE_NOT_FOUND'; end if;
end;
$$;
