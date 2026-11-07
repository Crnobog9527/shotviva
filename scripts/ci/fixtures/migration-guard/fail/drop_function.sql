-- expect: drop-object, drop-object
-- A signature change: the deployed code still calls the old signature until it is promoted.
drop function public.confirm_job(uuid, text);
create or replace function public.confirm_job(p_job uuid, p_key text, p_inputs jsonb default null)
returns void language sql as $$ select 1 $$;
drop function if exists public.confirm_job(uuid, text, jsonb);
