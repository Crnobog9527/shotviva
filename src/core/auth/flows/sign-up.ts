import 'server-only'

import { cookies, headers } from 'next/headers'

import { storeSignupReferral } from '../../affiliate/referral'
import { currentLocale, localized } from '../../i18n/server'
import { logger } from '../../logger'
import { currentOrigin } from '../../request-origin'
import { nextIn } from '../redirect-target'
import { clientIp } from '../signup-ip'
import { requestSignup } from '../signup-request'
import { staffSignupData } from '../staff-signup'
import { createAdminSupabase } from '../supabase-admin'
import { createSessionSupabase } from '../supabase-server'
import { classifyAuthError } from './classify-auth-error'
import { confirmUrl } from './callback-url'
import { failed, type FormState } from './form-state'
import { formFields, newPasswordSchema, resendSchema, resetRequestSchema, signUpSchema } from './schemas'

// A registered address gets the same "check your email" answer as a new one (no email
// enumeration, control 2026-11-06): with confirmations on Supabase answers with a user that has
// no identities and sends nothing; with them off it says `user_already_exists`, treated the same.
const REGISTERED = new Set(['user_already_exists', 'email_exists'])

// A partner's link (sv_ref) onto the new account, so verifying on another device still binds it
// (2021, ARCHITECTURE §6.5). Read from the cookie, never from the form. Every successful form
// replaces or clears what an earlier one for the address stored; a staff link's sign-up never
// binds, so it only clears. A registered address gets no real account back (or one the SQL
// refuses as not just created).
async function rememberReferral(userId: string | undefined, staff: Record<string, string>) {
  const cookie = Object.keys(staff).length ? undefined : (await cookies()).get('sv_ref')?.value
  await storeSignupReferral(userId, cookie)
}

// The verification link lands on `next` (the home draft, the Graylum connect page) when it is a
// same-site path that passes sanitizeNext, else the account page of the form's language.
export async function signUpWithPassword(form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, password, captchaToken, next } = parsed.data

  // Our per-IP limit first; it also leaves the row the Before User Created hook needs (1350).
  if ((await requestSignup(createAdminSupabase(), email, clientIp(await headers()))) !== 'ok') return failed('AUTH_SIGNUP_LIMITED')

  const supabase = await createSessionSupabase()
  const locale = await currentLocale()
  // user_metadata.locale picks the language of every auth email this account gets
  // (ARCHITECTURE §7: `{{ if eq .Data.locale "zh" }}` in supabase/templates/*.html).
  // A sign-up through an org's staff link remembers it (token and org), so a confirmation resent
  // from the ordinary login page, or one after the org reset its link, is still a staff sign-up
  // (no signup gift, 1940/1950).
  const staff = await staffSignupData(createAdminSupabase(), next)
  const data = { locale, ...staff }
  const { data: created, error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken, data, emailRedirectTo: confirmUrl(nextIn(next, locale), await currentOrigin()) },
  })
  if (error && !REGISTERED.has(error.code ?? '')) {
    const code = classifyAuthError(error)
    if (code === 'INTERNAL') logger.warn('sign-up failed', { code: error.code })
    return failed(code)
  }
  await rememberReferral(created?.user?.id, staff)
  return { status: 'sent' }
}

// "Send the email again" on the check-your-email view and on the login page's unverified notice.
// Only captcha and rate limits are shown, so the answer never says whether the address exists.
export async function resendSignupEmail(form: FormData): Promise<FormState> {
  const parsed = resendSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, captchaToken, next } = parsed.data

  const supabase = await createSessionSupabase()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { captchaToken, emailRedirectTo: confirmUrl(nextIn(next, await currentLocale()), await currentOrigin()) },
  })
  return quietly(error, 'sign-up email resend failed')
}

export async function requestPasswordReset(form: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, captchaToken } = parsed.data

  const supabase = await createSessionSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken,
    redirectTo: confirmUrl(await localized('/reset/update'), await currentOrigin()),
  })
  return quietly(error, 'password reset request failed')
}

// Only captcha and rate limits are shown; anything else still says "sent" to avoid enumeration.
function quietly(error: { code?: string; status?: number } | null, message: string): FormState {
  const code = error ? classifyAuthError(error) : null
  if (code === 'AUTH_CAPTCHA_FAILED' || code === 'AUTH_RATE_LIMITED') return failed(code)
  if (error) logger.warn(message, { code: error.code })
  return { status: 'sent' }
}

export async function updatePassword(form: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')

  const supabase = await createSessionSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return failed('UNAUTHORIZED')
  // Supabase signs this account out everywhere else when the password changes.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return failed(classifyAuthError(error))
  return { status: 'sent' }
}
