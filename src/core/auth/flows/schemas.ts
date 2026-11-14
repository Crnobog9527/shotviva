import { z } from 'zod'

// Matches minimum_password_length in supabase/config.toml (set the same in the cloud project).
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

const email = z.email().max(254)
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)
const captchaToken = z.string().max(4096).optional()
const next = z.string().max(512).optional()

export const signInSchema = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX), captchaToken })
export const signUpSchema = z.object({ email, password, captchaToken, next })
export const resendSchema = z.object({ email, captchaToken, next })
export const resetRequestSchema = z.object({ email, captchaToken })
// The confirmation is checked here as well as in the browser.
export const newPasswordSchema = z
  .object({ password, confirm: z.string().max(PASSWORD_MAX) })
  .refine((fields) => fields.password === fields.confirm)

// FormData -> plain object; empty strings count as absent so optional fields stay optional.
export function formFields(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && value !== '') out[key] = value
  }
  return out
}
