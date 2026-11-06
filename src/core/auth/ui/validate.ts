import { PASSWORD_MIN } from '../flows/schemas'

// Field checks the browser runs before a submit (design/comps-v3-b/auth.html `?err=weak|mismatch`
// and the email lines). The server checks again with the zod schemas in flows/schemas.ts.
export type FieldName = 'email' | 'password' | 'confirm'
export type FieldError = 'loginEmail' | 'email' | 'passwordMissing' | 'passwordShort' | 'passwordWeak' | 'mismatch'
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
