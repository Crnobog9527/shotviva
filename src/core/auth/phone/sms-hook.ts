import 'server-only'

import { z } from 'zod'

import { logger } from '../../logger'
import type { SenderChoice, SmsSender } from '../../sms'
import { phoneKey } from './phone-key'
import { maskPhone, parseStoredPhone, SMS_CODE_MINUTES, type MainlandPhone } from './phone-number'
import type { SmsLimitStatus } from './sms-limits'
import { verifyWebhookSignature } from './webhook-signature'

// Supabase Auth "Send SMS" hook (ARCHITECTURE §7, T63): Supabase makes the code and posts it
// here; we check the signature, take mainland numbers only, apply the per-number and per-IP
// limits (sms_authorize_send), and only then give the code to the SMS adapter. A 200 is
// success; anything else is `{ error: { http_code, message } }`, which Supabase turns into a
// failed sign-in. The code never reaches a log line, Sentry or analytics.
// https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook

const payloadSchema = z.object({
  user: z.object({ id: z.string(), phone: z.string().nullable().optional() }),
  // `phone` is where the code goes: the new number when an account binds one (phone_change,
  // 1410), else the account's own. Older Auth versions only sent user.phone.
  sms: z.object({ otp: z.string().regex(/^\d{6}$/), phone: z.string().optional() }),
})

export type SmsHookDeps = {
  secret: string | undefined
  sender: SenderChoice
  authorize(key: string): Promise<SmsLimitStatus>
  now?: () => number
}

const REFUSALS: Record<Exclude<SmsLimitStatus, 'ok'>, string> = {
  phone_cooldown: 'Wait 60 seconds before asking for another code',
  phone_daily: 'Too many codes for this number today',
  ip_daily: 'Too many codes from this network today',
  no_request: 'Codes are sent only through the sign-in page',
}

export function hookError(status: number, message: string): Response {
  return Response.json({ error: { http_code: status, message } }, { status })
}

export async function handleSmsHook(request: Request, deps: SmsHookDeps): Promise<Response> {
  if (!deps.secret) {
    logger.error('sms hook: SEND_SMS_HOOK_SECRET is not set')
    return hookError(503, 'SMS is not configured')
  }
  const body = await request.text()
  const failure = verifyWebhookSignature(deps.secret, request.headers, body, deps.now?.())
  if (failure) {
    logger.warn('sms hook: signature refused', { failure })
    return hookError(401, 'Invalid signature')
  }
  const payload = payloadSchema.safeParse(safeJson(body))
  if (!payload.success) return hookError(400, 'Unexpected payload')
  const phone = parseStoredPhone((payload.data.sms.phone || payload.data.user.phone)?.replace(/^\+/, ''))
  if (!phone) return hookError(400, 'Only mainland China (+86) mobile numbers are supported')
  if ('problem' in deps.sender) {
    logger.error('sms hook: no SMS provider', { problem: deps.sender.problem })
    return hookError(503, 'SMS is not configured')
  }
  return authorizeAndSend(deps, payload.data.user.id, phone, payload.data.sms.otp, deps.sender.sender)
}

async function authorizeAndSend(
  deps: SmsHookDeps,
  userId: string,
  phone: MainlandPhone,
  code: string,
  sender: SmsSender,
): Promise<Response> {
  const masked = maskPhone(phone.digits)
  try {
    const status = await deps.authorize(phoneKey(phone))
    if (status !== 'ok') {
      logger.warn('sms hook: limit', { userId, phone: masked, status })
      return hookError(429, REFUSALS[status])
    }
    const result = await sender.send({ to: { e164: phone.e164, national: phone.national }, code, validMinutes: SMS_CODE_MINUTES })
    if (!result.ok) {
      logger.warn('sms hook: provider refused', { userId, phone: masked, provider: sender.name, reason: result.reason, providerCode: result.providerCode })
      return hookError(result.reason === 'rejected' ? 429 : 502, 'The SMS could not be sent')
    }
    return Response.json({}, { status: 200 })
  } catch (error) {
    logger.error('sms hook: failed', { userId, phone: masked, error })
    return hookError(500, 'The SMS could not be sent')
  }
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}
