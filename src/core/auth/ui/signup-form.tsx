'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import type { FormState } from '../flows/form-state'
import { PASSWORD_MIN } from '../flows/schemas'
import { AuthTabs } from './auth-tabs'
import { CheckEmail } from './check-email'
import { CaptchaFailed, Divider, EmailField, hcaptchaLink, Notice, PasswordField, SubmitButton } from './form-parts'
import { SignupCodeHiddenInput } from './signup-code-context'
import { SignupCodeField } from './signup-code-field'
import { GoogleButton } from './google-button'
import { GiftGlyph } from './icons'
import { PhoneSignIn, type PhoneActions } from './phone-sign-in'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { validateSignup } from './validate'

type Props = {
  action: FormAction
  googleAction: FormAction
  resendAction: FormAction
  next: string
  // The free Standard images of the sign-up gift at the catalogue's cheapest Standard price,
  // through the page; `upTo` when templates cost different amounts (T91).
  freeImages: { count: number; upTo: boolean }
  arrived?: ReactNode
  sender: string
  // Chinese pages only (T63): the 手机号 tab, shown first.
  phone?: PhoneActions
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// /signup (design/comps-v3-b/auth.html `?v=signup|verify`, `?err=weak`; a registered address gets the same
// neutral "check your email" view, never `?err=exists`: control 2026-11-06).
export function SignupForm({ action, googleAction, resendAction, next, freeImages, arrived, sender, phone }: Props) {
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
          <b>{t('signup.gift', { count: freeImages.count, upTo: String(freeImages.upTo) })}</b>
          <span>{t('signup.giftNote')}</span>
        </span>
      </div>
      <SignupCodeField />
      {phone ? (
        <AuthTabs
          initial="phone"
          phone={<PhoneSignIn actions={phone} next={next} submitLabel={t('signup.submit')} />}
          email={<EmailSignup form={form} googleAction={googleAction} next={next} />}
        />
      ) : (
        <EmailSignup form={form} googleAction={googleAction} next={next} />
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
function EmailSignup({ form, googleAction, next }: { form: AuthForm; googleAction: FormAction; next: string }) {
  const t = useTranslations('auth')
  return (
    <>
      <SignupNotice form={form} />
      <GoogleButton action={googleAction} next={next} appearance="auth" />
      <Divider />
      <form onSubmit={form.onSubmit} noValidate className="au-form">
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
        <CaptchaFailed show={form.captchaFailed} />
      </form>
    </>
  )
}

function SignupNotice({ form }: { form: AuthForm }) {
  const t = useTranslations('auth')
  return form.errorCode ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null
}
