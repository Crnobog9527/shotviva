-- T12: the request review page (ARCHITECTURE §10 page 2, §15.2). Service role only; the
-- admin page's server actions check role = admin first.

-- Moves a request along the status machine (§15.1):
--   pending -> live       approve: it goes on the wall
--   pending -> rejected   reject
--   live    -> rejected   take down
--   live    -> shipped    a template now exists; p_template_id links it
-- Returns the reference image keys the move dropped (only a rejection drops any): the server
-- deletes those R2 objects after this commits, so the whole review is one database round trip
-- (AGENTS §5.1). A failed R2 delete leaves orphans under requests/{user_id}/, which are logged
-- and still go with the account.
create function public.admin_review_template_request(
  p_request_id uuid,
  p_status text,
  p_template_id text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_keys text[];
begin
  select r.status, r.image_keys into v_current, v_keys
    from public.template_requests r
   where r.id = p_request_id
     for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if not (
       (v_current = 'pending' and p_status in ('live', 'rejected'))
    or (v_current = 'live' and p_status in ('rejected', 'shipped'))
  ) then
    raise exception 'REQUEST_TRANSITION_INVALID'
      using detail = v_current || ' -> ' || coalesce(p_status, 'null');
  end if;

  if p_status = 'shipped' then
    perform 1 from public.templates t where t.id = p_template_id;
    if not found then
      raise exception 'TEMPLATE_NOT_FOUND';
    end if;
  end if;

  update public.template_requests
     set status = p_status,
         template_id = case when p_status = 'shipped' then p_template_id end,
         image_keys = case when p_status = 'rejected' then '{}'::text[] else image_keys end,
         reviewed_at = now()
   where id = p_request_id;

  return case when p_status = 'rejected' then v_keys else '{}'::text[] end;
end;
$$;

revoke execute on function public.admin_review_template_request(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_template_request(uuid, text, text) to service_role;

-- The review page's list: the 500 newest requests of each status, with the author's email
-- read live from auth.users (never copied). An Owner-only list with a hard cap instead of
-- paging (control 2026-11-06, AGENTS §5.1 rule 4): the page filters, searches and sorts this
-- bounded set itself. Each status is one ordered scan of template_requests_status_created_at_idx.
create function public.admin_list_template_requests()
returns table (
  id uuid,
  email text,
  description text,
  image_keys text[],
  status text,
  template_id text,
  votes_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, u.email::text, r.description, r.image_keys, r.status, r.template_id, r.votes_count, r.created_at
    from unnest(array['pending', 'live', 'shipped', 'rejected']) as s(status)
   cross join lateral (
           select t.id, t.user_id, t.description, t.image_keys, t.status, t.template_id, t.votes_count, t.created_at
             from public.template_requests t
            where t.status = s.status
            order by t.created_at desc
            limit 500
         ) r
    left join auth.users u on u.id = r.user_id
   order by r.created_at desc;
$$;

revoke execute on function public.admin_list_template_requests() from public, anon, authenticated;
grant execute on function public.admin_list_template_requests() to service_role;
