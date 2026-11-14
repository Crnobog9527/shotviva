-- Who may say a job was made again (ARCHITECTURE §4, §16.2c). The web route passes the work the
-- workspace was opened from as inputs.again_of; reserve_credits and reserve_batch_cell store
-- inputs as they are, so this trigger moves the id into generation_jobs.again_of before the row is
-- written, and only when it is the caller's own succeeded, undeleted work with the same template.
-- Anything else (someone else's work, a gallery work, a failed or deleted one, a malformed id) is
-- dropped silently: Make again never fails because of its trace, and a client id can never point
-- at another user's work. The key never stays in inputs. The money functions are not touched
-- (same approach as generation_jobs_gallery_excluded, 1320).
-- Index: the generation_jobs primary key.

create function public.set_job_again_of()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_raw text := new.inputs ->> 'again_of';
  v_source uuid;
begin
  -- Only this trigger sets the column: a value written straight into it is dropped too.
  new.again_of := null;
  if not (new.inputs ? 'again_of') then
    return new;
  end if;
  new.inputs := new.inputs - 'again_of';
  if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select g.id into v_source
      from public.generation_jobs g
     where g.id = v_raw::uuid and g.user_id = new.user_id and g.template_id = new.template_id
       and g.status = 'succeeded' and g.deleted_at is null;
    new.again_of := v_source;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_job_again_of() from public, anon, authenticated;

create trigger generation_jobs_again_of
  before insert on public.generation_jobs
  for each row execute function public.set_job_again_of();
