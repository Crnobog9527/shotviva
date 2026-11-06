'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { CheckEmail } from './check-email'
import { CaptchaLine, CaptchaSlot, Divider, EmailField, Notice, PasswordField, SubmitButton } from './form-parts'
import { GoogleButton } from './google-button'
import { AlertIcon } from './icons'
import { useAuthForm, type AuthForm, type FormAction } from './use-auth-form'
import { validateEmail, validateLogin } from './validate'

type Props = {
  action: FormAction
  googleAction: FormAction
  resendAction: FormAction
  next: string
  // A fixed code from /auth/callback or /auth/confirm (`?error=`), never free text.
  notice: string | null
  // The line under the title: the home draft, or the Graylum connection.
  arrived?: ReactNode
  sender: string
}

const addr = (chunks: ReactNode) => <span className="au-addr">{chunks}</span>

// /login (design/comps-v3-b/auth.html `?v=login`, `?err=creds|unverified`, `?captcha=1`).
export function LoginForm({ action, googleAction, resendAction, next, notice, arrived, sender }: Props) {
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
      <GoogleButton action={googleAction} next={next} appearance="auth" />
      <Divider />
      <form onSubmit={form.onSubmit} noValidate className="au-form">
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
        <CaptchaSlot mode={form.captcha.mode} mount={form.captcha.mountCheckbox} needsTick={form.needsTick} />
        <SubmitButton pending={form.pending}>{t('login.submit')}</SubmitButton>
      </form>
      <p className="au-swap">
        {t.rich('login.toSignup', { link: (chunks) => <Link href={`/signup?next=${encodeURIComponent(next)}`}>{chunks}</Link> })}
      </p>
      <CaptchaLine enabled={form.captcha.enabled} />
    </section>
  )
}

type NoticeProps = { form: AuthForm; notice: string | null; resendAction: FormAction; next: string; onResent(email: string): void }

function LoginNotice({ form, notice, resendAction, next, onResent }: NoticeProps) {
  const t = useTranslations('auth')
  const { state } = form
  if (state.status === 'error' && state.code === 'AUTH_EMAIL_NOT_CONFIRMED' && form.email) {
    return <UnverifiedNotice email={form.email} resendAction={resendAction} next={next} onResent={onResent} />
  }
  if (state.status === 'error' && state.code === 'AUTH_INVALID_CREDENTIALS') {
    return <Notice>{t.rich('login.creds', { reset: (chunks) => <Link href="/reset">{chunks}</Link> })}</Notice>
  }
  if (state.status === 'error') return <Notice>{t(`errors.${state.code}`)}</Notice>
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
    <form role="alert" onSubmit={resend.onSubmit} className="au-notice">
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
        <CaptchaSlot mode={resend.captcha.mode} mount={resend.captcha.mountCheckbox} needsTick={resend.needsTick} />
        {resend.state.status === 'error' ? <p>{t(`errors.${resend.state.code}`)}</p> : null}
      </div>
    </form>
  )
}
