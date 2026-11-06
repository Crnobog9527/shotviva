'use client'

import { useTranslations } from 'next-intl'
import { useEffect, type ReactNode } from 'react'

import { CaptchaFailed, CaptchaLine, Notice } from './form-parts'
import { MailGlyph } from './icons'
import { useAuthForm, type FormAction } from './use-auth-form'
import { useCooldown } from './use-cooldown'
import { validateEmail } from './validate'

type Props = {
  title: string
  // "We sent a verification link to …" with the address already in it.
  text: ReactNode
  email: string
  // Sends the same email again: the sign-up link, or the reset link.
  resendAction: FormAction
  next?: string
  // The way back ("Use a different email", "Back to log in").
  back: ReactNode
  // Shotviva <mail@shotviva.com> (site.brand.authEmail), from site.config through the page.
  sender: string
  // One more line under the actions (sign-up: "Already have an account? Log in or reset …").
  aside?: ReactNode
  // Arrived here right after a send (the login page's "Send it again").
  coolingDown?: boolean
}

// "Check your email" after a sign-up or a reset request (design/comps-v3-b/auth.html
// `?v=verify|reset-sent`): one glyph, the title, one line, resend with a 60-second wait.
export function CheckEmail({ title, text, email, resendAction, next, back, sender, aside, coolingDown = false }: Props) {
  const t = useTranslations('auth')
  const form = useAuthForm(resendAction, { captcha: true, validate: validateEmail })
  const cooldown = useCooldown()
  const { start } = cooldown

  useEffect(() => {
    if (coolingDown) start()
  }, [coolingDown, start])
  useEffect(() => {
    if (form.state.status === 'sent') start()
  }, [form.state, start])

  const waiting = cooldown.left > 0
  return (
    <section aria-labelledby="au-check-title">
      <div className="au-glyph">
        <MailGlyph />
      </div>
      <h1 id="au-check-title" className="au-title">
        {title}
      </h1>
      <p className="au-sub">{text}</p>
      {form.errorCode ? <Notice>{t(`errors.${form.errorCode}`)}</Notice> : null}
      <form onSubmit={form.onSubmit} className="au-acts">
        <input type="hidden" name="email" value={email} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <button type="submit" className="au-btn au-ghost" disabled={form.pending || waiting}>
          {waiting ? t('resend.wait', { seconds: cooldown.left }) : t('resend.again')}
        </button>
        <CaptchaFailed show={form.captchaFailed} />
        {back}
      </form>
      {aside ? <p className="au-swap">{aside}</p> : null}
      <p className="au-from">{t.rich('resend.from', { sender, b: (chunks) => <b>{chunks}</b> })}</p>
      <CaptchaLine enabled={form.captchaEnabled} />
    </section>
  )
}
