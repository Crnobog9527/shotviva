'use client'

import { Link } from '../../i18n/ui'
import { useTranslations } from 'next-intl'

import { AuthCard, CaptchaSlot, Field, FormMessage, SubmitButton } from './form-parts'
import { GoogleButton } from './google-button'
import { useAuthForm, type FormAction } from './use-auth-form'

type Props = { action: FormAction; googleAction: FormAction; next: string; notice: string | null }

export function LoginForm({ action, googleAction, next, notice }: Props) {
  const t = useTranslations('auth')
  const { state, pending, onSubmit, captcha, needsTick } = useAuthForm(action, true)
  return (
    <AuthCard title={t('login.title')}>
      {notice ? <p role="status" className="text-sm">{t(`notices.${notice}`)}</p> : null}
      <GoogleButton action={googleAction} next={next} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <Field name="email" type="email" label={t('fields.email')} autoComplete="email" />
        <Field name="password" type="password" label={t('fields.password')} autoComplete="current-password" />
        <CaptchaSlot mode={captcha.mode} mount={captcha.mountCheckbox} needsTick={needsTick} />
        <FormMessage state={state} />
        <SubmitButton pending={pending}>{t('login.submit')}</SubmitButton>
      </form>
      <nav className="flex justify-between text-sm">
        <Link href="/reset" className="underline">{t('login.forgot')}</Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="underline">{t('login.toSignup')}</Link>
      </nav>
    </AuthCard>
  )
}
