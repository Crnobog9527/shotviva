-- T63: the SMS code rate limits (ARCHITECTURE §7「中国大陆手机号验证码登录」). One row per code the
-- site asked Supabase to send: the server action writes it (with the visitor's IP, which the
-- Send SMS hook payload does not carry) before calling signInWithOtp, and the hook marks it sent
-- before handing the code to the SMS provider. A hook call with no fresh row is refused, so a
-- direct call to the Auth API cannot send without passing the same limits.
--
-- The phone number is not stored: phone_key is the sha256 hex of the E.164 digits, computed in
-- the app. Rows are only needed for 24 hours; sms_request_send (0441) deletes those older than
-- two days. Private: RLS on with no policy, reached only through the 0441 functions.

create table public.sms_sends (
  id bigint generated always as identity primary key,
  phone_key text not null check (phone_key ~ '^[0-9a-f]{64}$'),
  ip inet,
  requested_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Per number: the 60-second gap and the 5-a-day count; per IP: the 20-a-day count; the sweep.
create index sms_sends_phone_key_requested_at_idx on public.sms_sends (phone_key, requested_at desc);
create index sms_sends_ip_requested_at_idx on public.sms_sends (ip, requested_at desc) where ip is not null;
create index sms_sends_requested_at_idx on public.sms_sends (requested_at);

alter table public.sms_sends enable row level security;

revoke all on public.sms_sends from public, anon, authenticated;
grant select, insert, update, delete on public.sms_sends to service_role;
