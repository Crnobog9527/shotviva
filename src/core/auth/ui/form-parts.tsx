'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type ReactNode } from 'react'

import { PASSWORD_MAX, PASSWORD_MIN } from '../flows/schemas'
import { AlertIcon } from './icons'
import type { AuthForm } from './use-auth-form'
import { useHydrated } from './use-hydrated'
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

// Disabled until React has hydrated the form: before that a press (or Enter, which a disabled
// default button also stops) would make the browser submit the form itself, reloading the page
// with the fields in the address and the input gone. On a slow network that takes seconds
// (mainland China, 2026-11-12), so after a moment the label says the page is still loading
// (auth.css: `.au-primary[data-wait]`, pure CSS, since no script runs yet; the button keeps its
// display, so hydration shifts nothing).
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  const t = useTranslations('auth.pending')
  const hydrated = useHydrated()
  return (
    <button
      type="submit"
      disabled={pending || !hydrated}
      aria-busy={pending || undefined}
      data-wait={hydrated ? undefined : ''}
      className="au-btn au-primary"
    >
      {hydrated ? (
        children
      ) : (
        <>
          <span className="au-lbl">{children}</span>
          <span className="au-wait">{t('loading')}</span>
        </>
      )}
    </button>
  )
}

const PHASE_KEYS = {
  checking: { normal: 'checking', slow: 'checkingSlow' },
  sending: { normal: 'sending', slow: 'sendingSlow' },
} as const

// The line under the button while the form works, so a press never looks like nothing happened:
// 「正在准备安全验证…」 while hCaptcha answers, 「正在提交…」 while the server does, and a
// slow-network version of each after a few seconds. Always in the page, so screen readers hear
// each change.
export function FormStatus({ form }: { form: AuthForm }) {
  const t = useTranslations('auth.pending')
  const key = form.phase ? PHASE_KEYS[form.phase][form.slow ? 'slow' : 'normal'] : null
  return (
    <p role="status" className="au-hint au-status">
      {key ? t(key) : null}
    </p>
  )
}

// The one line under a form when the invisible check did not complete (closed, expired or
// failed); the next submit asks hCaptcha again (ARCHITECTURE §7). When the network was the
// cause (the script or the check timed out), it says so and carries its own retry.
export function CaptchaFailed({ form }: { form: AuthForm }) {
  const t = useTranslations('auth.captcha')
  if (!form.captchaFailed) return null
  return (
    <p role="alert" className="au-err">
      <AlertIcon />
      <span>
        {t(form.captchaNetwork ? 'network' : 'failed')}
        {form.captchaNetwork ? (
          <>
            {' '}
            <button type="submit" className="au-retry">
              {t('retry')}
            </button>
          </>
        ) : null}
      </span>
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
