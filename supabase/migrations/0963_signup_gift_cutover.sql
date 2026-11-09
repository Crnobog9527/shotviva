CREATE OR REPLACE FUNCTION "public"."grant_credits"("p_user_id" "uuid", "p_amount" integer, "p_reason" "text", "p_idempotency_key" "text", "p_pool" "text") RETURNS "public"."credit_change"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_profile public.profiles;
  cutoff timestamptz;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using detail = 'amount must be positive';
  end if;

  if p_idempotency_key = 'signup:' || p_user_id::text then
    lock table public.profiles in row exclusive mode;
    select * into v_profile from public.profiles where id = p_user_id;
    -- Read the committed version, not the app bundle: a stale tab must not award six
    -- old credits after cutover, nor may an old account claim a second registration gift.
    select updated_at into cutoff from public.system_settings
     where key='pricing_catalog_version' and value='"v2"'::jsonb;
    if cutoff is not null then
      if v_profile.created_at < cutoff then
        return row(false,v_profile.credits,v_profile.free_credits,v_profile.paid_until)::public.credit_change;
      end if;
      p_amount := 100;
    end if;
    if v_profile.signup_ip is not null then
      perform pg_advisory_xact_lock(hashtextextended('shotviva.signup_ip:' || host(v_profile.signup_ip), 0));
      if not exists (select 1 from public.credit_ledger where idempotency_key = p_idempotency_key)
         and exists (
           select 1
             from public.profiles other
             join public.credit_ledger l on l.idempotency_key = 'signup:' || other.id::text
            where other.signup_ip = v_profile.signup_ip
              and other.id <> p_user_id
              and l.created_at > v_profile.created_at - interval '24 hours'
         ) then
        return row(false, v_profile.credits, v_profile.free_credits, v_profile.paid_until)::public.credit_change;
      end if;
    end if;
  end if;

  return public._apply_credit_change(p_user_id, p_pool, 'grant', p_amount, p_reason, p_idempotency_key);
end;
$$;
