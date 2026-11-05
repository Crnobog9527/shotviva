'use client'

import { useTranslations } from 'next-intl'
import { useActionState } from 'react'

import { IDLE } from '../flows/form-state'
import { FormMessage } from './form-parts'
import type { FormAction } from './use-auth-form'

// Google sign-in has no captcha: Supabase does not check it for OAuth, and Google
// already screens the sign-in.
export function GoogleButton({ action, next }: { action: FormAction; next: string }) {
  const t = useTranslations('auth')
  const [state, formAction, pending] = useActionState(action, IDLE)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-md border border-input text-base font-medium disabled:opacity-60"
      >
        {t('google')}
      </button>
      <FormMessage state={state} />
    </form>
  )
}
