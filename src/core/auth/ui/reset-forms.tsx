'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { PASSWORD_MIN } from '../flows/schemas'
import { AuthCard, CaptchaSlot, Field, FormMessage, SubmitButton } from './form-parts'
import { useAuthForm, type FormAction } from './use-auth-form'

export function ResetRequestForm({ action, linkExpired }: { action: FormAction; linkExpired: boolean }) {
  const t = useTranslations('auth')
  const { state, pending, onSubmit, captcha, needsTick } = useAuthForm(action, true)
  return (
    <AuthCard title={t('reset.title')}>
      {linkExpired ? <p role="status" className="text-sm">{t('notices.link_expired')}</p> : null}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field name="email" type="email" label={t('fields.email')} autoComplete="email" />
        <CaptchaSlot mode={captcha.mode} mount={captcha.mountCheckbox} needsTick={needsTick} />
        <FormMessage state={state} sentKey="reset.sent" />
        <SubmitButton pending={pending}>{t('reset.submit')}</SubmitButton>
      </form>
      <Link href="/login" className="text-sm underline">{t('reset.toLogin')}</Link>
    </AuthCard>
  )
}

// Reached only through the recovery link, which signs the visitor in first.
export function UpdatePasswordForm({ action }: { action: FormAction }) {
  const t = useTranslations('auth')
  const { state, pending, onSubmit } = useAuthForm(action, false)
  return (
    <AuthCard title={t('update.title')}>
      {state.status === 'sent' ? (
        <Link href="/account" className="underline">{t('update.done')}</Link>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field
            name="password"
            type="password"
            label={t('fields.newPassword', { min: PASSWORD_MIN })}
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
          />
          <FormMessage state={state} />
          <SubmitButton pending={pending}>{t('update.submit')}</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}
