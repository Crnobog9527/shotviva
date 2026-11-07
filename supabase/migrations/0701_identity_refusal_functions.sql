-- T81 (ARCHITECTURE §5.1a): writing a refusal, and the counts /admin/users shows.

-- Rows past 90 days, oldest first, a bounded batch at a time (no scheduled job, ARCHITECTURE §13).
-- Run by both functions below, so the table is swept on writes and on admin reads alike.
create function public.purge_identity_refusals()
returns void
language sql
set search_path = ''
as $$
  delete from public.identity_refusals r
   where r.id in (select o.id from public.identity_refusals o
                   where o.created_at < now() - interval '90 days'
                   order by o.created_at
                   limit 500)
$$;

revoke execute on function public.purge_identity_refusals() from public, anon, authenticated;
grant execute on function public.purge_identity_refusals() to service_role;

-- One refusal, written by the generation and edit routes before they answer
-- IDENTITY_SWAP_REFUSED. The excerpt is cut to 200 characters here too, so a longer one can never
-- fail the insert. A workspace batch sends one request per photo with the same words, so the
-- same words from the same entry within 10 minutes are one refusal, not one per photo (else a
-- single batch would flag the account). Answers whether a row was written. The tokens are those
-- of the decision call that refused it, null when none was made.
create function public.record_identity_refusal(
  p_user_id uuid,
  p_entry text,
  p_method text,
  p_excerpt text,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_excerpt text := left(btrim(p_excerpt), 200);
begin
  if p_user_id is null or coalesce(v_excerpt, '') = '' then
    raise exception 'INVALID_INPUT' using detail = 'user and excerpt are required';
  end if;
  -- Concurrent photos of one batch queue here, so only the first of them writes.
  perform pg_advisory_xact_lock(hashtextextended('identity_refusal:' || p_user_id::text, 0));

  if exists (select 1 from public.identity_refusals r
              where r.user_id = p_user_id and r.entry = p_entry and r.excerpt = v_excerpt
                and r.created_at > now() - interval '10 minutes') then
    return false;
  end if;

  insert into public.identity_refusals (user_id, entry, method, excerpt, input_tokens, output_tokens)
  values (p_user_id, p_entry, p_method, v_excerpt, p_input_tokens, p_output_tokens);

  perform public.purge_identity_refusals();
  return true;
end;
$$;

revoke execute on function public.record_identity_refusal(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_identity_refusal(uuid, text, text, text, integer, integer) to service_role;

-- Refusals per account for a page of accounts: over the 90 days kept, and over the last 24
-- hours (three or more there flags the account red in the list). Accounts with none are not
-- returned. At most 200 ids per call, a page or less. Sweeps expired rows first.
create function public.admin_identity_refusal_counts(p_user_ids uuid[])
returns table (user_id uuid, total integer, last_24h integer)
language plpgsql
set search_path = ''
as $$
begin
  perform public.purge_identity_refusals();
  return query
  select r.user_id,
         count(*)::integer as total,
         (count(*) filter (where r.created_at > now() - interval '24 hours'))::integer as last_24h
    from public.identity_refusals r
   where r.user_id = any (p_user_ids[1:200])
     and r.created_at > now() - interval '90 days'
   group by r.user_id;
end;
$$;

revoke execute on function public.admin_identity_refusal_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_identity_refusal_counts(uuid[]) to service_role;
