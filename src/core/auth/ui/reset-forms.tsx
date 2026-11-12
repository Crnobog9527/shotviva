'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { PASSWORD_MIN } from '../flows/schemas'
import { CheckEmail } from './check-email'
import { CaptchaFailed, CaptchaLine, EmailField, FormStatus, Heading, Notice, PasswordField, SubmitButton } from './form-parts'
import { CheckGlyph, ClockGlyph } from './icons'
import { useAuthForm, type FormAction } from './use-auth-form'
import { validateEmail, validateNewPassword } from './validate'

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

type RequestProps = {
  action: FormAction
  // /reset?error=link_expired: the recovery link was expired or already used.
  linkExpired: boolean
  // How long a reset link works (supabase/config.toml otp_expiry), for the copy.
  linkHours: number
  sender: string
}

// /reset (design/comps-v3-b/auth.html `?v=reset|reset-sent|expired`).
export function ResetRequestForm({ action, linkExpired, linkHours, sender }: RequestProps) {
  const t = useTranslations('auth')
  const form = useAuthForm(action, { captcha: true, validate: validateEmail })
  const [expired, setExpired] = useState(linkExpired)
  const { state } = form
  const sentTo = state.status === 'sent' ? form.email : null

  if (expired) return <ExpiredLink hours={linkHours} onNewLink={() => setExpired(false)} />
  if (sentTo) {
    return (
      <CheckEmail
        title={t('reset.sentTitle')}
        text={t.rich('reset.sent', { email: sentTo, hours: linkHours, addr })}
        email={sentTo}
        resendAction={action}
        sender={sender}
        back={<BackToLogin />}
      />
    )
  }
  return (
    <section aria-labelledby="au-reset-title">
      <Heading title={t('reset.title')}>{t('reset.sub')}</Heading>
      {form.errorCode ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null}
      <form method="post" onSubmit={form.onSubmit} noValidate className="au-form au-form-gap">
        <EmailField form={form} name="email" label={t('fields.email')} autoComplete="email" placeholder={t('placeholders.email')} />
        <SubmitButton pending={form.pending}>{t('reset.submit')}</SubmitButton>
        <FormStatus form={form} />
        <CaptchaFailed form={form} />
      </form>
      <p className="au-swap">
        <Link href="/login">{t('reset.back')}</Link>
      </p>
      <CaptchaLine enabled={form.captchaEnabled} />
    </section>
  )
}

function BackToLogin() {
  const t = useTranslations('auth')
  return (
    <Link href="/login" className="au-btn au-quiet">
      {t('reset.back')}
    </Link>
  )
}

function ExpiredLink({ hours, onNewLink }: { hours: number; onNewLink(): void }) {
  const t = useTranslations('auth')
  return (
    <section aria-labelledby="au-expired-title">
      <div className="au-glyph">
        <ClockGlyph />
      </div>
      <h1 id="au-expired-title" className="au-title">
        {t('expired.title')}
      </h1>
      <p className="au-sub">{t('expired.text', { hours })}</p>
      <div className="au-acts">
        <button type="button" className="au-btn au-primary" onClick={onNewLink}>
          {t('expired.newLink')}
        </button>
        <BackToLogin />
      </div>
    </section>
  )
}

// /reset/update, reached only through the recovery link, which signs the visitor in first
// (design/comps-v3-b/auth.html `?v=update|updated`, `?err=mismatch`).
export function UpdatePasswordForm({ action, email }: { action: FormAction; email: string | null }) {
  const t = useTranslations('auth')
  const form = useAuthForm(action, { captcha: false, validate: validateNewPassword })
  if (form.state.status === 'sent') return <PasswordSaved />
  return (
    <section aria-labelledby="au-update-title">
      <h1 id="au-update-title" className="au-title">
        {t('update.title')}
      </h1>
      {email ? <p className="au-sub">{t.rich('update.for', { email, addr })}</p> : null}
      {form.errorCode ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null}
      <form method="post" onSubmit={form.onSubmit} noValidate className="au-form au-form-gap">
        <PasswordField
          form={form}
          name="password"
          label={t('fields.newPassword')}
          autoComplete="new-password"
          placeholder={t('placeholders.chooseNew')}
          hint={t('hints.passwordMin', { min: PASSWORD_MIN })}
        />
        <PasswordField
          form={form}
          name="confirm"
          label={t('fields.confirmPassword')}
          autoComplete="new-password"
          placeholder={t('placeholders.again')}
        />
        <SubmitButton pending={form.pending}>{t('update.submit')}</SubmitButton>
      </form>
    </section>
  )
}

function PasswordSaved() {
  const t = useTranslations('auth')
  return (
    <section aria-labelledby="au-saved-title">
      <div className="au-glyph au-glyph-ok">
        <CheckGlyph />
      </div>
      <h1 id="au-saved-title" className="au-title">
        {t('update.doneTitle')}
      </h1>
      <p className="au-sub">{t('update.done')}</p>
      <div className="au-acts">
        <Link href="/generate" className="au-btn au-primary">
          {t('update.continue')}
        </Link>
      </div>
    </section>
  )
}
