import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '../../errors'

// The two steps of a code against public.sms_sends (0440, 0441), service-role client only.
// Limits (last 24 hours): 1 per number per 60 s, 5 per number, and per IP an admin setting
// (default 50; default 200 when the visitor's sv_ref slug is a valid org partner link, decided in
// SQL and remembered on the row for the hook, 2027).

const statusSchema = z.enum(['ok', 'phone_cooldown', 'phone_daily', 'ip_daily', 'no_request'])
export type SmsLimitStatus = z.infer<typeof statusSchema>

type Rpc = Pick<SupabaseClient, 'rpc'>

async function call(db: Rpc, fn: string, args: Record<string, unknown>): Promise<SmsLimitStatus> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new AppError('INTERNAL', `${fn} failed`, { cause: new Error(error.message) })
  return statusSchema.parse(data)
}

// The server action, before signInWithOtp. `ip` is the visitor's (null in local dev); `refSlug`
// the slug of its sv_ref cookie, if any.
// `code` (2031): the sign-up code the phone form submits; an org staff member's invite code gets
// the org link's looser limit too. Without one the 3-argument function is called, as before.
export function requestSmsSend(db: Rpc, key: string, ip: string | null, refSlug: string | null = null, code?: string | null): Promise<SmsLimitStatus> {
  if (code === undefined) return call(db, 'sms_request_send', { p_phone_key: key, p_ip: ip, p_ref_slug: refSlug })
  return call(db, 'sms_request_send', { p_phone_key: key, p_ip: ip, p_ref_slug: refSlug, p_code: code })
}

// The Send SMS hook, before any provider is called.
export function authorizeSmsSend(db: Rpc, key: string): Promise<SmsLimitStatus> {
  return call(db, 'sms_authorize_send', { p_phone_key: key })
}

// The request sent nothing (Supabase refused before the hook ran): it no longer counts.
export async function releaseSmsSend(db: Rpc, key: string): Promise<void> {
  const { error } = await db.rpc('sms_release_send', { p_phone_key: key })
  if (error) throw new AppError('INTERNAL', 'sms_release_send failed', { cause: new Error(error.message) })
}
