import 'server-only'

import { logger } from '../../logger'
import { DEFAULT_AFTER_LOGIN } from '../redirect-target'
import { createServerSupabase } from '../supabase-server'
import { classifyAuthError } from './classify-auth-error'
import { callbackUrl } from './callback-url'
import { failed, type FormState } from './form-state'
import { formFields, newPasswordSchema, resetRequestSchema, signUpSchema } from './schemas'

// The answer is "check your email" whether or not the address already has an account,
// so the form never reveals who is registered.
export async function signUpWithPassword(form: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, password, captchaToken } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { captchaToken, emailRedirectTo: callbackUrl(DEFAULT_AFTER_LOGIN) },
  })
  if (error) {
    const code = classifyAuthError(error)
    if (code === 'INTERNAL') logger.warn('sign-up failed', { code: error.code })
    return failed(code)
  }
  return { status: 'sent' }
}

export async function requestPasswordReset(form: FormData): Promise<FormState> {
  const parsed = resetRequestSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, captchaToken } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    captchaToken,
    redirectTo: callbackUrl('/reset/update', 'recovery'),
  })
  const code = error ? classifyAuthError(error) : null
  // Only captcha and rate limits are shown; anything else still says "sent" to avoid enumeration.
  if (code === 'AUTH_CAPTCHA_FAILED' || code === 'AUTH_RATE_LIMITED') return failed(code)
  if (error) logger.warn('password reset request failed', { code: error.code })
  return { status: 'sent' }
}

export async function updatePassword(form: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(formFields(form))
  if (!parsed.success) return failed('INVALID_INPUT')

  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return failed('UNAUTHORIZED')
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return failed(classifyAuthError(error))
  return { status: 'sent' }
}
