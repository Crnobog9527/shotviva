'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type ReactNode } from 'react'

import { PASSWORD_MAX, PASSWORD_MIN } from '../flows/schemas'
import { AlertIcon } from './icons'
import type { AuthForm } from './use-auth-form'
import type { FieldError, FieldName } from './validate'

// The building blocks of design/comps-v3-b/auth.html; styles are the `au-` classes in
// app/[locale]/(auth)/auth.css.

const HCAPTCHA_PRIVACY = 'https://www.hcaptcha.com/privacy'

export function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="au-title">{title}</h1>
      {children ? <p className="au-sub">{children}</p> : null}
    </>
  )
}

// The form-level notice: the problem and the way out.
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="au-notice">
      <AlertIcon />
      <p>{children}</p>
    </div>
  )
}

type FieldProps = {
  form: AuthForm
  name: FieldName
  label: string
  autoComplete: string
  placeholder: string
  // The link on the label line ("Forgot password?").
  aside?: ReactNode
  hint?: string
}

export function useFieldError(form: AuthForm, name: FieldName): string | null {
  const t = useTranslations('auth.fieldErrors')
  const error: FieldError | undefined = form.fieldErrors[name]
  return error ? t(error, { min: PASSWORD_MIN }) : null
}

export function FieldLines({ id, hint, error }: { id: string; hint?: string; error: string | null }) {
  if (error) {
    return (
      <p id={id} className="au-err">
        <AlertIcon />
        {error}
      </p>
    )
  }
  return hint ? <p id={id} className="au-hint">{hint}</p> : null
}

// 16px type stops iOS from zooming on focus (DESIGN §8.5).
export function EmailField({ form, name, label, autoComplete, placeholder, hint }: FieldProps) {
  const id = useId()
  const error = useFieldError(form, name)
  return (
    <div className="au-field">
      <label className="au-lab" htmlFor={id}>
        {label}
      </label>
      <div className="au-ctl">
        <input
          id={id}
          className="au-input"
          type="email"
          name={name}
          autoComplete={autoComplete}
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={placeholder}
          maxLength={254}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-line` : undefined}
          onInput={() => form.clearField(name)}
        />
      </div>
      <FieldLines id={`${id}-line`} hint={hint} error={error} />
    </div>
  )
}

export function PasswordField({ form, name, label, autoComplete, placeholder, aside, hint }: FieldProps) {
  const t = useTranslations('auth')
  const id = useId()
  const error = useFieldError(form, name)
  const [shown, setShown] = useState(false)
  return (
    <div className="au-field">
      <div className="au-lab">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="au-ctl au-pw">
        <input
          id={id}
          className="au-input"
          type={shown ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={PASSWORD_MAX}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-line` : undefined}
          onInput={() => form.clearField(name)}
        />
        <button className="au-eye" type="button" aria-pressed={shown} aria-controls={id} onClick={() => setShown(!shown)}>
          {t(shown ? 'hide' : 'show')}
        </button>
      </div>
      <FieldLines id={`${id}-line`} hint={hint} error={error} />
    </div>
  )
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className="au-btn au-primary">
      {children}
    </button>
  )
}

// The one line under a form when the invisible check did not complete (closed, expired or
// failed); the next submit asks hCaptcha again (ARCHITECTURE §7).
export function CaptchaFailed({ show }: { show: boolean }) {
  const t = useTranslations('auth.captcha')
  if (!show) return null
  return (
    <p role="alert" className="au-err">
      <AlertIcon />
      {t('failed')}
    </p>
  )
}

// "hCaptcha" in the disclosure links to its privacy policy in a new tab (Owner 2026-11-07).
export const hcaptchaLink = (chunks: ReactNode) => (
  <a href={HCAPTCHA_PRIVACY} target="_blank" rel="noopener noreferrer">
    {chunks}
  </a>
)

// Invisible hCaptcha must be disclosed where it runs. Sign-up says it inside its consent sentence;
// forms without one (login, reset, resend) carry this one line of the same quiet fine print.
export function CaptchaLine({ enabled }: { enabled: boolean }) {
  const t = useTranslations('auth.captcha')
  if (!enabled) return null
  return <p className="au-fine">{t.rich('line', { hcaptcha: hcaptchaLink })}</p>
}

export function Divider() {
  const t = useTranslations('auth')
  return (
    <div className="au-or" aria-hidden="true">
      {t('or')}
    </div>
  )
}
