import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { noteSignupGift } from '../../alerts'
import type { ErrorCode } from '../../errors'
import { localized } from '../../i18n/server'
import { logger } from '../../logger'
import { currentOrigin } from '../../request-origin'
import { phoneKey } from '../phone/phone-key'
import { maskPhone, parseMainlandPhone } from '../phone/phone-number'
import { releaseSmsSend, requestSmsSend } from '../phone/sms-limits'
import { claimSignupGift, type ClaimMethod, type ClaimStatus } from '../signup-gift-claim'
import { clientIp } from '../signup-ip'
import { createAdminSupabase } from '../supabase-admin'
import { createSessionSupabase } from '../supabase-server'
import { callbackUrl } from './callback-url'
import { classifyPhoneError, limitError } from './classify-phone-error'
import { failed, type FormState } from './form-state'
import { formFields } from './schemas'

// The account page's 「领取注册赠分」 (1410, ARCHITECTURE §7). A pending account binds a phone
// number (Supabase phone change: our SMS limits, the Send SMS hook, a six-digit code) or links a
// Google account, then claim_signup_gift pays it if that phone or Google account never paid a
// signup gift before. The session decides whose account it is; the database reads the phone and
// the Google identity from Supabase Auth.

export type ClaimState = FormState | { status: 'claimed' } | { status: 'unclaimed'; reason: Exclude<ClaimStatus, 'granted'> }

const sendSchema = z.object({ phone: z.string().max(32), consent: z.literal('on') })
const verifySchema = z.object({ phone: z.string().max(32), code: z.string().regex(/^\d{6}$/) })

async function sessionUser() {
  const supabase = await createSessionSupabase()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user }
}

async function claim(userId: string, method: ClaimMethod): Promise<ClaimState> {
  const result = await claimSignupGift(createAdminSupabase(), userId, method)
  if (result !== 'granted') return { status: 'unclaimed', reason: result }
  noteSignupGift()
  return { status: 'claimed' }
}

export async function sendClaimPhoneCode(form: FormData): Promise<ClaimState> {
  const fields = formFields(form)
  if (fields.consent !== 'on') return failed('AUTH_CONSENT_REQUIRED')
  const parsed = sendSchema.safeParse(fields)
  const phone = parsed.success ? parseMainlandPhone(parsed.data.phone) : null
  if (!phone) return failed('AUTH_PHONE_INVALID')
  const { supabase, user } = await sessionUser()
  if (!user) return failed('UNAUTHORIZED')

  const admin = createAdminSupabase()
  const key = phoneKey(phone)
  const status = await requestSmsSend(admin, key, clientIp(await headers()))
  if (status !== 'ok') return failed(limitError(status))

  // Supabase sends the code through the Send SMS hook to the new number (phone_change).
  const { error } = await supabase.auth.updateUser({ phone: phone.e164 })
  if (!error) return { status: 'sent' }
  const code: ErrorCode = error.code === 'phone_exists' ? 'AUTH_PHONE_TAKEN' : classifyPhoneError(error)
  if (code !== 'AUTH_SMS_FAILED') {
    await releaseSmsSend(admin, key).catch((cause: unknown) => logger.warn('sms request release failed', { error: cause }))
  }
  logger.warn('claim phone code not sent', { userId: user.id, phone: maskPhone(phone.digits), code: error.code, status: error.status })
  return failed(code)
}

export async function verifyClaimPhoneCode(form: FormData): Promise<ClaimState> {
  const parsed = verifySchema.safeParse(formFields(form))
  if (!parsed.success) return failed('AUTH_OTP_INVALID')
  const phone = parseMainlandPhone(parsed.data.phone)
  if (!phone) return failed('AUTH_PHONE_INVALID')
  const { supabase, user } = await sessionUser()
  if (!user) return failed('UNAUTHORIZED')

  const { data, error } = await supabase.auth.verifyOtp({ phone: phone.e164, token: parsed.data.code, type: 'phone_change' })
  if (error || !data.user) {
    const code = classifyPhoneError(error)
    if (code === 'AUTH_SMS_FAILED') logger.warn('claim phone code check failed', { code: error?.code, status: error?.status })
    return failed(code === 'AUTH_SMS_FAILED' ? 'INTERNAL' : code)
  }
  return claim(data.user.id, 'phone')
}

// An account that already has a Google identity claims at once; otherwise Google is linked to
// this account first (Supabase manual linking) and /auth/callback claims after the sign-in.
export async function claimWithGoogle(): Promise<ClaimState> {
  const { supabase, user } = await sessionUser()
  if (!user) return failed('UNAUTHORIZED')
  if (user.identities?.some(identity => identity.provider === 'google')) return claim(user.id, 'google')

  const next = await localized('/account')
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: callbackUrl(next, 'oauth', await currentOrigin()) },
  })
  if (error || !data.url) {
    logger.warn('google link start failed', { userId: user.id, code: error?.code })
    return failed('INTERNAL')
  }
  redirect(data.url)
}
