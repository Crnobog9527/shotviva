import 'server-only'
import { redirect } from 'next/navigation'

import { currentLocale, localized } from '../../i18n/server'
import { logger } from '../../logger'
import { onVerifiedSignIn } from '../first-sign-in'
import { sanitizeNext } from '../redirect-target'
import { isEmailVerified, metadataLocale } from '../session-user'
import { createServerSupabase } from '../supabase-server'
import { classifyAuthError } from './classify-auth-error'
import { callbackUrl } from './callback-url'
import { failed, type FormState } from './form-state'
import { formFields, signInSchema } from './schemas'

export type SignInOptions = { freeCredits: number }

export async function signInWithPassword(form: FormData, options: SignInOptions): Promise<FormState> {
  const fields = formFields(form)
  const parsed = signInSchema.safeParse(fields)
  if (!parsed.success) return failed('INVALID_INPUT')
  const { email, password, captchaToken } = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
  if (error || !data.user) {
    const code = classifyAuthError(error)
    if (code === 'INTERNAL') logger.warn('password sign-in failed', { code: error?.code })
    return failed(code)
  }
  // With confirmations on Supabase refuses unverified sign-ins; this guards a misconfigured project.
  if (!isEmailVerified(data.user)) {
    await supabase.auth.signOut({ scope: 'local' })
    return failed('AUTH_EMAIL_NOT_CONFIRMED')
  }
  await onVerifiedSignIn(data.user.id, options.freeCredits, 'email', metadataLocale(data.user) ?? (await currentLocale()))
  redirect(sanitizeNext(fields.next))
}

export async function signInWithGoogle(form: FormData): Promise<FormState> {
  const supabase = await createServerSupabase()
  // The PKCE verifier cookie is written here; /auth/callback exchanges the code with it.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl(sanitizeNext(formFields(form).next), 'oauth') },
  })
  if (error || !data.url) {
    logger.warn('google sign-in start failed', { code: error?.code })
    return failed('INTERNAL')
  }
  redirect(data.url)
}

// `then`: where to land afterwards, a same-site path (sanitised; the home page otherwise), e.g.
// the login page on the way back to /connect/graylum ("Not you?").
export async function signOut(then?: string): Promise<never> {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect(await localized(then ? sanitizeNext(then) : '/'))
}
