import 'server-only'

import { currentLocale, localized } from '../../i18n/server'
import { logger } from '../../logger'
import { nextIn } from '../redirect-target'
import { createServerSupabase } from '../supabase-server'
import { classifyAuthError } from './classify-auth-error'
import { confirmUrl } from './callback-url'
import { failed, type FormState } from './form-state'
import { formFields, newPasswordSchema, resendSchema, resetRequestSchema, signUpSchema } from './schemas'

// A registered address gets the same "check your email" answer as a new one (no email
// enumeration, control 2026-11-06): with confirmations on Supabase answers with a user that has
// no identities and sends nothing; with them off it says `user_already_exists`, treated the same.
const REGISTERED = new Set(['user_already_exists', 'email_exists'])

// The verification link lands on `next` (the home draft, the Graylum connect page) when it is a
// same-site path that passes sanitizeNext, else the account page of the form's language.
export async function signUpWithPassword(form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, password, captchaToken, next } = parsed.data

  const supabase = await createServerSupabase()
  const locale = await currentLocale()
  // user_metadata.locale picks the language of every auth email this account gets
  // (ARCHITECTURE §7: `{{ if eq .Data.locale "zh" }}` in supabase/templates/*.html).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken, data: { locale }, emailRedirectTo: confirmUrl(nextIn(next, locale)) },
  })
  if (error && !REGISTERED.has(error.code ?? '')) {
    const code = classifyAuthError(error)
    if (code === 'INTERNAL') logger.warn('sign-up failed', { code: error.code })
    return failed(code)
  }
  return { status: 'sent' }
}

// "Send the email again" on the check-your-email view and on the login page's unverified notice.
// Only captcha and rate limits are shown, so the answer never says whether the address exists.
export async function resendSignupEmail(form: FormData): Promise<FormState> {
  const parsed = resendSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, captchaToken, next } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { captchaToken, emailRedirectTo: confirmUrl(nextIn(next, await currentLocale())) },
  })
  return quietly(error, 'sign-up email resend failed')
}

export async function requestPasswordReset(form: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, captchaToken } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken,
    redirectTo: confirmUrl(await localized('/reset/update')),
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

  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return failed('UNAUTHORIZED')
  // Supabase signs this account out everywhere else when the password changes.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return failed(classifyAuthError(error))
  return { status: 'sent' }
}
