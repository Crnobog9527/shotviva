-- T81 (ARCHITECTURE §5.1a): writing a refusal, and the counts /admin/users shows.

-- One refusal, written by the generation and edit routes before they answer
-- IDENTITY_SWAP_REFUSED. The excerpt is cut to 200 characters here too, so a longer one can never
-- fail the insert. A workspace batch sends one request per photo with the same words, so the
-- same words from the same entry within 10 minutes are one refusal, not one per photo (else a
-- single batch would flag the account). Answers whether a row was written. Rows past 90 days go
-- in the same call, oldest first, a bounded batch at a time (no scheduled job, ARCHITECTURE §13).
create function public.record_identity_refusal(p_user_id uuid, p_entry text, p_method text, p_excerpt text)
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

  insert into public.identity_refusals (user_id, entry, method, excerpt)
  values (p_user_id, p_entry, p_method, v_excerpt);

  delete from public.identity_refusals r
   where r.id in (select o.id from public.identity_refusals o
                   where o.created_at < now() - interval '90 days'
                   order by o.created_at
                   limit 200);
  return true;
end;
$$;

revoke execute on function public.record_identity_refusal(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_identity_refusal(uuid, text, text, text) to service_role;

-- Refusals per account for a page of accounts: over the 90 days kept, and over the last 24
-- hours (three or more there flags the account red in the list). Accounts with none are not
-- returned. At most 200 ids per call, a page or less.
create function public.admin_identity_refusal_counts(p_user_ids uuid[])
returns table (user_id uuid, total integer, last_24h integer)
language sql
stable
set search_path = ''
as $$
  select r.user_id,
         count(*)::integer as total,
         (count(*) filter (where r.created_at > now() - interval '24 hours'))::integer as last_24h
    from public.identity_refusals r
   where r.user_id = any (p_user_ids[1:200])
     and r.created_at > now() - interval '90 days'
   group by r.user_id
$$;

revoke execute on function public.admin_identity_refusal_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_identity_refusal_counts(uuid[]) to service_role;
