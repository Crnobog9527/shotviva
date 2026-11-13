'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { AuthTabs } from './auth-tabs'
import { CheckEmail } from './check-email'
import { CaptchaFailed, CaptchaLine, Divider, EmailField, FormStatus, Notice, PasswordField, SubmitButton } from './form-parts'
import { GoogleButton } from './google-button'
import { GoogleMainlandNote } from './google-mainland-note'
import type { GoogleProps } from './google-props'
import { AlertIcon } from './icons'
import { PhoneSignIn, type PhoneActions } from './phone-sign-in'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { validateEmail, validateLogin } from './validate'

type Props = {
  action: FormAction
  // Google sign-in, and whether to say under it that it does not load in mainland China.
  google: GoogleProps
  resendAction: FormAction
  next: string
  // A fixed code from /auth/callback or /auth/confirm (`?error=`), never free text.
  notice: string | null
  // The line under the title: the home draft, or the Graylum connection.
  arrived?: ReactNode
  sender: string
  // Chinese pages only (T63): the 手机号 tab, shown first unless a notice is about the email flow.
  phone?: PhoneActions
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// /login (design/comps-v3-b/auth.html `?v=login`, `?err=creds|unverified`, `?captcha=1`).
export function LoginForm({ action, google, resendAction, next, notice, arrived, sender, phone }: Props) {
  const t = useTranslations('auth')
  const form = useAuthForm(action, { captcha: true, validate: validateLogin })
  const [verifying, setVerifying] = useState<string | null>(null)

  if (verifying) {
    return (
      <CheckEmail
        title={t('verify.title')}
        text={t.rich('verify.text', { email: verifying, addr })}
        email={verifying}
        resendAction={resendAction}
        next={next}
        sender={sender}
        coolingDown
        back={
          <button type="button" className="au-btn au-quiet" onClick={() => setVerifying(null)}>
            {t('reset.back')}
          </button>
        }
      />
    )
  }
  return (
    <section aria-labelledby="au-login-title">
      <h1 id="au-login-title" className="au-title">
        {t('login.title')}
      </h1>
      {arrived}
      <LoginNotice form={form} notice={notice} resendAction={resendAction} next={next} onResent={setVerifying} />
      {phone ? (
        <AuthTabs
          initial={notice ? 'email' : 'phone'}
          phone={<PhoneSignIn actions={phone} next={next} submitLabel={t('login.submit')} />}
          email={<EmailLogin form={form} google={google} next={next} />}
        />
      ) : (
        <EmailLogin form={form} google={google} next={next} />
      )}
      <p className="au-swap">
        {t.rich('login.toSignup', { link: (chunks) => <Link href={`/signup?next=${encodeURIComponent(next)}`}>{chunks}</Link> })}
      </p>
      <CaptchaLine enabled={form.captchaEnabled} />
    </section>
  )
}

// Google, then email and password: the whole page in English, the 邮箱 tab in Chinese.
function EmailLogin({ form, google, next }: { form: AuthForm; google: GoogleProps; next: string }) {
  const t = useTranslations('auth')
  return (
    <>
      <GoogleButton action={google.action} next={next} appearance="auth" />
      <GoogleMainlandNote show={google.mainlandNote} />
      <Divider />
      <form method="post" onSubmit={form.onSubmit} noValidate className="au-form">
        <input type="hidden" name="next" value={next} />
        <EmailField form={form} name="email" label={t('fields.email')} autoComplete="email" placeholder={t('placeholders.email')} />
        <PasswordField
          form={form}
          name="password"
          label={t('fields.password')}
          autoComplete="current-password"
          placeholder={t('placeholders.password')}
          aside={<Link href="/reset">{t('login.forgot')}</Link>}
        />
        <SubmitButton pending={form.pending}>{t('login.submit')}</SubmitButton>
        <FormStatus form={form} />
        <CaptchaFailed form={form} />
      </form>
    </>
  )
}

type NoticeProps = { form: AuthForm; notice: string | null; resendAction: FormAction; next: string; onResent(email: string): void }

function LoginNotice({ form, notice, resendAction, next, onResent }: NoticeProps) {
  const t = useTranslations('auth')
  if (form.errorCode === 'AUTH_EMAIL_NOT_CONFIRMED' && form.email) {
    return <UnverifiedNotice email={form.email} resendAction={resendAction} next={next} onResent={onResent} />
  }
  if (form.errorCode === 'AUTH_INVALID_CREDENTIALS') {
    return <Notice>{t.rich('login.creds', { reset: (chunks) => <Link href="/reset">{chunks}</Link> })}</Notice>
  }
  if (form.errorCode) return <Notice>{t(`errors.${form.errorCode}`)}</Notice>
  return notice ? <Notice>{t(`notices.${notice}`)}</Notice> : null
}

type UnverifiedProps = { email: string; resendAction: FormAction; next: string; onResent(email: string): void }

// "Verify your email first … Send it again": the resend runs here, then the page turns into the
// check-your-email view with the wait already counting.
function UnverifiedNotice({ email, resendAction, next, onResent }: UnverifiedProps) {
  const t = useTranslations('auth')
  const resend = useAuthForm(resendAction, { captcha: true, validate: validateEmail })
  useEffect(() => {
    if (resend.state.status === 'sent') onResent(email)
  }, [resend.state, email, onResent])
  return (
    <form method="post" role="alert" onSubmit={resend.onSubmit} className="au-notice">
      <AlertIcon />
      <div className="grid gap-2">
        <p>
          {t.rich('login.unverified', {
            email,
            addr,
            resend: (chunks) => (
              <button type="submit" disabled={resend.pending}>
                {chunks}
              </button>
            ),
          })}
        </p>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        {resend.errorCode ? <p>{t(`errors.${resend.errorCode}`)}</p> : null}
        {resend.captchaFailed ? <p>{t(resend.captchaNetwork ? 'captcha.network' : 'captcha.failed')}</p> : null}
      </div>
    </form>
  )
}
