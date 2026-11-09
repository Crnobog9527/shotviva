'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { cn } from '../../ui/cn'
import { IDLE } from '../flows/form-state'
import { SignupCodeHiddenInput } from './signup-code-context'
import { GoogleMark } from './icons'
import type { FormAction } from './use-auth-form'

type Props = {
  action: FormAction
  next: string
  // `auth`: the sign-in pages' ghost button with Google's mark (design/comps-v3-b/auth.html).
  appearance?: 'plain' | 'auth'
  // Restyles the plain button (the home sign-up prompt draws it as its one primary).
  className?: string
}

// Google sign-in has no captcha: Supabase does not check it for OAuth, and Google
// already screens the sign-in.
export function GoogleButton({ action, next, appearance = 'plain', className }: Props) {
  const t = useTranslations('auth')
  const [state, formAction, pending] = useActionState(action, IDLE)
  const auth = appearance === 'auth'
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SignupCodeHiddenInput />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        className={
          auth
            ? 'au-btn au-ghost au-google'
            : cn('h-12 w-full rounded-md border border-input text-base font-medium disabled:opacity-60', className)
        }
      >
        {auth ? <GoogleMark /> : null}
        {t('google')}
      </button>
      {state.status === 'error' ? (
        <p role="alert" className={auth ? 'au-err' : 'text-sm'}>
          {t(`errors.${state.code}`)}
        </p>
      ) : null}
    </form>
  )
}
