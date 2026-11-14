import 'server-only'
import type { SignupBenefits } from '../signup-code'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import type { ErrorCode } from '../../errors'
import { currentLocale } from '../../i18n/server'
import { logger } from '../../logger'
import { onVerifiedSignIn } from '../first-sign-in'
import { phoneKey } from '../phone/phone-key'
import { maskPhone, parseMainlandPhone } from '../phone/phone-number'
import { releaseSmsSend, requestSmsSend } from '../phone/sms-limits'
import { sanitizeNext } from '../redirect-target'
import { metadataLocale } from '../session-user'
import { clientIp } from '../signup-ip'
import { createAdminSupabase } from '../supabase-admin'
import { createSessionSupabase } from '../supabase-server'
import { classifyPhoneError, limitError } from './classify-phone-error'
import { failed, type FormState } from './form-state'
import { formFields } from './schemas'

// Phone sign-in (ARCHITECTURE §7, T63): one code both signs up and signs in, no password.

const sendSchema = z.object({ phone: z.string().max(32), consent: z.literal('on'), captchaToken: z.string().max(4096).optional() })
const verifySchema = z.object({ phone: z.string().max(32), code: z.string().regex(/^\d{6}$/), next: z.string().max(512).optional() })

export type PhoneSignInOptions = SignupBenefits

// Our limits first (they also note the visitor's IP for the hook), then Supabase, which checks
// hCaptcha and calls the Send SMS hook. A refusal before the hook gives the request back.
export async function sendPhoneCode(form: FormData): Promise<FormState> {
  const fields = formFields(form)
  if (fields.consent !== 'on') return failed('AUTH_CONSENT_REQUIRED')
  const parsed = sendSchema.safeParse(fields)
  const phone = parsed.success ? parseMainlandPhone(parsed.data.phone) : null
  if (!parsed.success || !phone) return failed('AUTH_PHONE_INVALID')

  const admin = createAdminSupabase()
  const key = phoneKey(phone)
  const status = await requestSmsSend(admin, key, clientIp(await headers()))
  if (status !== 'ok') return failed(limitError(status))

  const locale = await currentLocale()
  const supabase = await createSessionSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    phone: phone.e164,
    options: {
      channel: 'sms',
      shouldCreateUser: true,
      captchaToken: parsed.data.captchaToken,
      // Applied only when this creates the account: its language, and when it agreed to the
      // privacy policy and the cross-border transfer (PIPL), as the box it ticked.
      data: { locale, phone_consent_at: new Date().toISOString() },
    },
  })
  if (!error) return { status: 'sent' }
  const code = classifyPhoneError(error)
  if (code !== 'AUTH_SMS_FAILED') {
    await releaseSmsSend(admin, key).catch((cause: unknown) => logger.warn('sms request release failed', { error: cause }))
  }
  logger.warn('phone code not sent', { phone: maskPhone(phone.digits), code: error.code, status: error.status })
  return failed(code)
}

export async function verifyPhoneCode(form: FormData, options: PhoneSignInOptions): Promise<FormState> {
  const parsed = verifySchema.safeParse(formFields(form))
  if (!parsed.success) return failed('AUTH_OTP_INVALID')
  const phone = parseMainlandPhone(parsed.data.phone)
  if (!phone) return failed('AUTH_PHONE_INVALID')

  const supabase = await createSessionSupabase()
  const { data, error } = await supabase.auth.verifyOtp({ phone: phone.e164, token: parsed.data.code, type: 'sms' })
  if (error || !data.user) return failed(verifyError(error))
  await onVerifiedSignIn(data.user.id, options, 'phone', metadataLocale(data.user) ?? (await currentLocale()))
  redirect(sanitizeNext(parsed.data.next))
}

// A wrong or expired code says so; anything unexpected is logged (status words only).
function verifyError(error: { code?: string; status?: number } | null): ErrorCode {
  const code = classifyPhoneError(error)
  if (code !== 'AUTH_SMS_FAILED') return code
  logger.warn('phone code check failed', { code: error?.code, status: error?.status })
  return 'INTERNAL'
}
