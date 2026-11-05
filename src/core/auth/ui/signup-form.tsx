'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { PASSWORD_MIN } from '../flows/schemas'
import { AuthCard, CaptchaSlot, Field, FormMessage, SubmitButton } from './form-parts'
import { GoogleButton } from './google-button'
import { useAuthForm, type FormAction } from './use-auth-form'

type Props = { action: FormAction; googleAction: FormAction; next: string; freeImages: number }

export function SignupForm({ action, googleAction, next, freeImages }: Props) {
  const t = useTranslations('auth')
  const { state, pending, onSubmit, captcha, needsTick } = useAuthForm(action, true)
  if (state.status === 'sent') {
    return (
      <AuthCard title={t('signup.sentTitle')}>
        <p role="status">{t('signup.sent')}</p>
      </AuthCard>
    )
  }
  return (
    <AuthCard title={t('signup.title')}>
      <p className="text-sm text-neutral-600">{t('signup.freeImages', { count: freeImages })}</p>
      <GoogleButton action={googleAction} next={next} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field name="email" type="email" label={t('fields.email')} autoComplete="email" />
        <Field
          name="password"
          type="password"
          label={t('fields.newPassword', { min: PASSWORD_MIN })}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
        />
        <CaptchaSlot mode={captcha.mode} mount={captcha.mountCheckbox} needsTick={needsTick} />
        <FormMessage state={state} />
        <SubmitButton pending={pending}>{t('signup.submit')}</SubmitButton>
      </form>
      <p className="text-sm">
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">{t('signup.toLogin')}</Link>
      </p>
    </AuthCard>
  )
}
