-- Keep the existing transition lock, validation, return value and grants (0062).
create or replace function public.admin_review_template_request(
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

  if p_status = 'shipped' then
    insert into public.template_request_notices (user_id, request_id)
    select r.user_id, r.id from public.template_requests r where r.id = p_request_id
    union all
    select v.user_id, v.request_id from public.template_request_votes v where v.request_id = p_request_id
    on conflict (user_id, request_id) do nothing;
  end if;

  return case when p_status = 'rejected' then v_keys else '{}'::text[] end;
end;
$$;
