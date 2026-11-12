'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import type { FormState } from '../flows/form-state'
import { PASSWORD_MIN } from '../flows/schemas'
import { AuthTabs } from './auth-tabs'
import { CheckEmail } from './check-email'
import { CaptchaFailed, Divider, EmailField, FormStatus, hcaptchaLink, Notice, PasswordField, SubmitButton } from './form-parts'
import { SignupCodeHiddenInput } from './signup-code-context'
import { SignupCodeField } from './signup-code-field'
import { GoogleButton } from './google-button'
import { GoogleMainlandNote } from './google-mainland-note'
import type { GoogleProps } from './google-props'
import { GiftGlyph } from './icons'
import { PhoneSignIn, type PhoneActions } from './phone-sign-in'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { validateSignup } from './validate'

type Props = {
  action: FormAction
  // Google sign-in, and whether to say under it that it does not load in mainland China.
  google: GoogleProps
  resendAction: FormAction
  next: string
  giftCredits: number
  arrived?: ReactNode
  sender: string
  // Chinese pages only (T63): the 手机号 tab, shown first.
  phone?: PhoneActions
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// /signup (design/comps-v3-b/auth.html `?v=signup|verify`, `?err=weak`; a registered address gets the same
// neutral "check your email" view, never `?err=exists`: control 2026-11-06).
export function SignupForm({ action, google, resendAction, next, giftCredits, arrived, sender, phone }: Props) {
  const t = useTranslations('auth')
  const form = useAuthForm(action, { captcha: true, validate: validateSignup })
  // "Use a different email" puts this answer aside; the next submit brings a new one.
  const [setAside, setSetAside] = useState<FormState | null>(null)
  const sentTo = form.state.status === 'sent' && form.state !== setAside ? form.email : null

  if (sentTo) {
    return (
      <CheckEmail
        title={t('verify.title')}
        text={t.rich('verify.textSignup', { email: sentTo, addr })}
        email={sentTo}
        resendAction={resendAction}
        next={next}
        sender={sender}
        aside={t.rich('verify.haveAccount', {
          login: (chunks) => <Link href={`/login?next=${encodeURIComponent(next)}`}>{chunks}</Link>,
          reset: (chunks) => <Link href="/reset">{chunks}</Link>,
        })}
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
          <b>{t('signup.gift', { count: giftCredits })}</b>
          <span>{t('signup.giftNote')}</span>
        </span>
      </div>
      <SignupCodeField />
      {phone ? (
        <AuthTabs
          initial="phone"
          phone={<PhoneSignIn actions={phone} next={next} submitLabel={t('signup.submit')} />}
          email={<EmailSignup form={form} google={google} next={next} />}
        />
      ) : (
        <EmailSignup form={form} google={google} next={next} />
      )}
      <p className="au-fine">
        {t.rich(form.captchaEnabled ? 'signup.fineCaptcha' : 'signup.fine', {
          terms: (chunks) => <Link href="/terms">{chunks}</Link>,
          privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
          hcaptcha: hcaptchaLink,
        })}
      </p>
      <p className="au-swap">
        {t.rich('signup.toLogin', { link: (chunks) => <Link href={`/login?next=${encodeURIComponent(next)}`}>{chunks}</Link> })}
      </p>
    </section>
  )
}

// Google, then email and password: the whole page in English, the 邮箱 tab in Chinese.
function EmailSignup({ form, google, next }: { form: AuthForm; google: GoogleProps; next: string }) {
  const t = useTranslations('auth')
  return (
    <>
      <SignupNotice form={form} />
      <GoogleButton action={google.action} next={next} appearance="auth" />
      <GoogleMainlandNote show={google.mainlandNote} />
      <Divider />
      <form method="post" onSubmit={form.onSubmit} noValidate className="au-form">
        <SignupCodeHiddenInput />
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
        <SubmitButton pending={form.pending}>{t('signup.submit')}</SubmitButton>
        <FormStatus form={form} />
        <CaptchaFailed form={form} />
      </form>
    </>
  )
}

function SignupNotice({ form }: { form: AuthForm }) {
  const t = useTranslations('auth')
  return form.errorCode ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null
}
