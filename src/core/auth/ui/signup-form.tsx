'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import type { FormState } from '../flows/form-state'
import { PASSWORD_MIN } from '../flows/schemas'
import { CheckEmail } from './check-email'
import { CaptchaLine, CaptchaSlot, Divider, EmailField, Notice, PasswordField, SubmitButton } from './form-parts'
import { GoogleButton } from './google-button'
import { GiftGlyph } from './icons'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { validateSignup } from './validate'

type Props = {
  action: FormAction
  googleAction: FormAction
  resendAction: FormAction
  next: string
  // The free Standard images of the sign-up gift, from site.config through the page.
  freeImages: number
  arrived?: ReactNode
  sender: string
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// /signup (design/comps-v3-b/auth.html `?v=signup|verify`, `?err=exists|weak`).
export function SignupForm({ action, googleAction, resendAction, next, freeImages, arrived, sender }: Props) {
  const t = useTranslations('auth')
  const form = useAuthForm(action, { captcha: true, validate: validateSignup })
  // "Use a different email" puts this answer aside; the next submit brings a new one.
  const [setAside, setSetAside] = useState<FormState | null>(null)
  const sentTo = form.state.status === 'sent' && form.state !== setAside ? form.email : null

  if (sentTo) {
    return (
      <CheckEmail
        title={t('verify.title')}
        text={t.rich('verify.text', { email: sentTo, addr })}
        email={sentTo}
        resendAction={resendAction}
        next={next}
        sender={sender}
        back={
          <button type="button" className="au-btn au-quiet" onClick={() => setSetAside(form.state)}>
            {t('verify.different')}
          </button>
        }
      />
    )
  }
  return (
    <section aria-labelledby="au-signup-title">
      <h1 id="au-signup-title" className="au-title">
        {t('signup.title')}
      </h1>
      {arrived}
      <div className="au-gift">
        <span className="au-gift-ico">
          <GiftGlyph />
        </span>
        <span>
          <b>{t('signup.gift', { count: freeImages })}</b>
          <span>{t('signup.giftNote')}</span>
        </span>
      </div>
      <SignupNotice form={form} next={next} />
      <GoogleButton action={googleAction} next={next} appearance="auth" />
      <Divider />
      <form onSubmit={form.onSubmit} noValidate className="au-form">
        <input type="hidden" name="next" value={next} />
        <EmailField
          form={form}
          name="email"
          label={t('fields.email')}
          autoComplete="email"
          placeholder={t('placeholders.email')}
          hint={t('hints.verifyEmail')}
        />
        <PasswordField
          form={form}
          name="password"
          label={t('fields.password')}
          autoComplete="new-password"
          placeholder={t('placeholders.choose')}
          hint={t('hints.passwordMin', { min: PASSWORD_MIN })}
        />
        <CaptchaSlot mode={form.captcha.mode} mount={form.captcha.mountCheckbox} needsTick={form.needsTick} />
        <SubmitButton pending={form.pending}>{t('signup.submit')}</SubmitButton>
      </form>
      <p className="au-fine">
        {t.rich('signup.fine', {
          terms: (chunks) => <Link href="/terms">{chunks}</Link>,
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
        })}
      </p>
      <p className="au-swap">
        {t.rich('signup.toLogin', { link: (chunks) => <Link href={`/login?next=${encodeURIComponent(next)}`}>{chunks}</Link> })}
      </p>
      <CaptchaLine enabled={form.captcha.enabled} />
    </section>
  )
}

function SignupNotice({ form, next }: { form: AuthForm; next: string }) {
  const t = useTranslations('auth')
  if (form.state.status === 'exists') {
    return (
      <Notice>
        {t.rich('signup.exists', {
          email: form.email,
          addr,
          login: (chunks) => <Link href={`/login?next=${encodeURIComponent(next)}`}>{chunks}</Link>,
          reset: (chunks) => <Link href="/reset">{chunks}</Link>,
        })}
      </Notice>
    )
  }
  return form.state.status === 'error' ? <Notice>{t(`errors.${form.state.code}`)}</Notice> : null
}
