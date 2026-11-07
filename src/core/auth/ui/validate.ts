import { PASSWORD_MIN } from '../flows/schemas'
import { parseMainlandPhone } from '../phone/phone-number'

// Field checks the browser runs before a submit (design/comps-v3-b/auth.html `?err=weak|mismatch`
// and the email lines). The server checks again with the zod schemas in flows/schemas.ts.
export type FieldName = 'email' | 'password' | 'confirm' | 'phone' | 'code' | 'consent'
export type FieldError = 'loginEmail' | 'email' | 'passwordMissing' | 'passwordShort' | 'passwordWeak' | 'mismatch' | 'phone' | 'code' | 'consent'
export type FieldErrors = Partial<Record<FieldName, FieldError>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const text = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

const done = (errors: FieldErrors): FieldErrors | null => (Object.keys(errors).length > 0 ? errors : null)

export function validateLogin(form: FormData): FieldErrors | null {
  return done({
    ...(EMAIL.test(text(form, 'email').trim()) ? {} : { email: 'loginEmail' }),
    ...(text(form, 'password') ? {} : { password: 'passwordMissing' }),
  })
}

export function validateEmail(form: FormData): FieldErrors | null {
  return done(EMAIL.test(text(form, 'email').trim()) ? {} : { email: 'email' })
}

export function validateSignup(form: FormData): FieldErrors | null {
  return done({
    ...validateEmail(form),
    ...(text(form, 'password').length >= PASSWORD_MIN ? {} : { password: 'passwordShort' }),
  })
}

export function validateNewPassword(form: FormData): FieldErrors | null {
  const password = text(form, 'password')
  if (password.length < PASSWORD_MIN) return { password: 'passwordShort' }
  return done(text(form, 'confirm') === password ? {} : { confirm: 'mismatch' })
}

// Phone sign-in (T63): a mainland number, and the privacy / cross-border box ticked, before any
// code is asked for.
export function validatePhoneSend(form: FormData): FieldErrors | null {
  return done({
    ...(parseMainlandPhone(text(form, 'phone')) ? {} : { phone: 'phone' }),
    ...(text(form, 'consent') === 'on' ? {} : { consent: 'consent' }),
  })
}

export function validateCode(form: FormData): FieldErrors | null {
  return done(/^\d{6}$/.test(text(form, 'code')) ? {} : { code: 'code' })
}
