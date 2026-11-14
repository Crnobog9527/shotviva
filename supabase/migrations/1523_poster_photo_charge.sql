-- 拍照识别's charge and refund (ARCHITECTURE §5.3「每周复用」): one run, one debit through the
-- credit ledger like a generation (paid pool first, then free, never split); a failed or
-- unreadable run is refunded to the same pool. Service role only; the route calls them.

-- Starts a run: the price from system_settings.poster_photo_credits (no row: PRICE_UNSET, the
-- feature is off), the hourly limit counted under the profile lock (so a burst cannot slip
-- through), the pending row and its debit, in one transaction.
create or replace function public.start_poster_photo(p_user_id uuid, p_provider text, p_per_hour integer)
returns table (extraction_id bigint, credits integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_price integer;
  v_pool text;
  v_id bigint;
begin
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.banned_at is not null then raise exception 'USER_BANNED'; end if;

  select (s.value #>> '{}')::integer into v_price from public.system_settings s
   where s.key = 'poster_photo_credits' and jsonb_typeof(s.value) = 'number' and (s.value #>> '{}') ~ '^[1-9][0-9]*$';
  if v_price is null then raise exception 'PRICE_UNSET'; end if;

  if (select count(*) from public.poster_extractions e
       where e.user_id = p_user_id and e.created_at >= now() - interval '1 hour') >= p_per_hour then
    raise exception 'RATE_LIMITED';
  end if;

  if v_profile.credits >= v_price then v_pool := 'paid';
  elsif v_profile.free_credits >= v_price then v_pool := 'free';
  else raise exception 'CREDITS_INSUFFICIENT';
  end if;

  insert into public.poster_extractions (user_id, source, input_chars, status, provider, credits, credit_pool)
  values (p_user_id, 'photo', 0, 'pending', p_provider, v_price, v_pool)
  returning id into v_id;

  perform public._apply_credit_change(p_user_id, v_pool, 'reserve', -v_price, 'poster photo',
    'poster_photo:' || v_id::text || ':reserve');
  return query select v_id, v_price;
end;
$$;

-- A failed run: its credits back to the pool they came from, once; the row records the usage.
-- An ok row is never refunded.
create or replace function public.refund_poster_photo(p_extraction_id bigint, p_input_chars integer,
  p_input_tokens integer, p_output_tokens integer, p_cost_usd numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_row public.poster_extractions;
begin
  select e.user_id into v_user from public.poster_extractions e where e.id = p_extraction_id;
  if not found then raise exception 'JOB_NOT_FOUND'; end if;
  -- Same lock order as start_poster_photo (profile, then row).
  perform 1 from public.profiles where id = v_user for update;
  select * into v_row from public.poster_extractions where id = p_extraction_id for update;
  if v_row.status = 'failed' then return; end if;
  if v_row.status = 'ok' then raise exception 'JOB_ALREADY_SETTLED'; end if;

  if v_row.credits > 0 then
    perform public._apply_credit_change(v_user, v_row.credit_pool, 'refund', v_row.credits, 'poster photo refund',
      'poster_photo:' || p_extraction_id::text || ':refund');
  end if;
  update public.poster_extractions
     set status = 'failed', input_chars = coalesce(p_input_chars, input_chars), input_tokens = p_input_tokens,
         output_tokens = p_output_tokens, cost_usd = p_cost_usd
   where id = p_extraction_id;
end;
$$;

revoke all on function public.start_poster_photo(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.refund_poster_photo(bigint, integer, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.start_poster_photo(uuid, text, integer) to service_role;
grant execute on function public.refund_poster_photo(bigint, integer, integer, integer, numeric) to service_role;
