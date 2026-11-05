'use client'

import { startTransition, useActionState, useEffect, useState, type FormEvent } from 'react'

import { IDLE, type FormState } from '../flows/form-state'
import { useCaptcha } from './use-captcha'

export type FormAction = (state: FormState, form: FormData) => Promise<FormState>

// Wraps a server action: fetches a captcha token (when the form needs one), attaches it,
// and reports a missing checkbox tick as a local state instead of a round trip.
export function useAuthForm(action: FormAction, needsCaptcha: boolean) {
  const [state, dispatch, pending] = useActionState(action, IDLE)
  const captcha = useCaptcha()
  const [needsTick, setNeedsTick] = useState(false)
  const { consumed } = captcha

  useEffect(() => {
    if (state.status !== 'idle') consumed(state.status === 'error' && state.code === 'AUTH_CAPTCHA_FAILED')
  }, [state, consumed])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (needsCaptcha) {
      const token = await captcha.getToken()
      if (token === null) return setNeedsTick(true)
      if (token) form.set('captchaToken', token)
    }
    setNeedsTick(false)
    startTransition(() => dispatch(form))
  }

  return { state, pending, onSubmit, captcha, needsTick }
}
