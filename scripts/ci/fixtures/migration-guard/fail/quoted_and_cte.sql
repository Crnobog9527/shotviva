-- expect: drop-object, delete
drop table "public"."Legacy Orders";
with gone as (delete from public.template_request_votes where weight = 0 returning request_id)
select count(*) from gone;
