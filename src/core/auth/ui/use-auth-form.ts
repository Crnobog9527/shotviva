'use client'

import { startTransition, useActionState, useCallback, useEffect, useState, type FormEvent } from 'react'

import { IDLE, type FormState } from '../flows/form-state'
import { useCaptcha } from './use-captcha'
import type { FieldErrors, FieldName } from './validate'

export type FormAction = (state: FormState, form: FormData) => Promise<FormState>

type Options = { captcha: boolean; validate?: (form: FormData) => FieldErrors | null }

// Wraps a server action: checks the fields in the browser first, fetches a captcha token (when
// the form needs one), attaches it, and reports a missing checkbox tick as a local state instead
// of a round trip. Keeps the address it last sent, for the "check your email" views.
export function useAuthForm(action: FormAction, { captcha: needsCaptcha, validate }: Options) {
  const [state, dispatch, pending] = useActionState(action, IDLE)
  const captcha = useCaptcha()
  const [needsTick, setNeedsTick] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [email, setEmail] = useState('')
  const { consumed } = captcha

  useEffect(() => {
    if (state.status !== 'idle') consumed(state.status === 'error' && state.code === 'AUTH_CAPTCHA_FAILED')
  }, [state, consumed])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const invalid = validate?.(form) ?? null
    setFieldErrors(invalid ?? {})
    if (invalid) return
    if (needsCaptcha) {
      const token = await captcha.getToken()
      if (token === null) return setNeedsTick(true)
      if (token) form.set('captchaToken', token)
    }
    setNeedsTick(false)
    const sent = form.get('email')
    if (typeof sent === 'string') setEmail(sent.trim())
    startTransition(() => dispatch(form))
  }

  // Typing in a field clears its line; the next submit checks again.
  const clearField = useCallback((name: FieldName) => {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
  }, [])

  return { state, pending, onSubmit, captcha, needsTick, fieldErrors, clearField, email }
}

export type AuthForm = ReturnType<typeof useAuthForm>
