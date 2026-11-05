import { z } from 'zod'

// Matches minimum_password_length in supabase/config.toml (set the same in the cloud project).
export const PASSWORD_MIN = 8

const email = z.email().max(254)
const password = z.string().min(PASSWORD_MIN).max(72)
const captchaToken = z.string().max(4096).optional()

export const signInSchema = z.object({ email, password: z.string().min(1).max(72), captchaToken })
export const signUpSchema = z.object({ email, password, captchaToken })
export const resetRequestSchema = z.object({ email, captchaToken })
export const newPasswordSchema = z.object({ password })

// FormData -> plain object; empty strings count as absent so optional fields stay optional.
export function formFields(form: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string' && value !== '') out[key] = value
  }
  return out
}
