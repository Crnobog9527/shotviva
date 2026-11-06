'use client'

import { startTransition, useActionState, useCallback, useState, type FormEvent } from 'react'

import type { ErrorCode } from '../../errors'
import { IDLE, type FormState } from '../flows/form-state'
import { useCaptcha } from './use-captcha'
import type { FieldErrors, FieldName } from './validate'

export type FormAction = (state: FormState, form: FormData) => Promise<FormState>

type Options = { captcha: boolean; validate?: (form: FormData) => FieldErrors | null }

// Wraps a server action: checks the fields in the browser first, asks hCaptcha for an invisible
// token (when the form needs one) and attaches it. A check that did not complete, here or at
// Supabase, becomes one line under the form; the next submit asks again. Keeps the address it
// last sent, for the "check your email" views.
export function useAuthForm(action: FormAction, { captcha: needsCaptcha, validate }: Options) {
  const [state, dispatch, pending] = useActionState(action, IDLE)
  const captcha = useCaptcha()
  const [checking, setChecking] = useState(false)
  const [captchaUnfinished, setCaptchaUnfinished] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [email, setEmail] = useState('')

  // false when the check did not complete; true when there is a token or captcha is off.
  async function attachToken(form: FormData): Promise<boolean> {
    setChecking(true)
    const token = await captcha.getToken()
    setChecking(false)
    setCaptchaUnfinished(token === null)
    if (token) form.set('captchaToken', token)
    return token !== null
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking || pending) return
    const form = new FormData(event.currentTarget)
    const invalid = validate?.(form) ?? null
    setFieldErrors(invalid ?? {})
    if (invalid) return
    if (needsCaptcha && !(await attachToken(form))) return
    const sent = form.get('email')
    if (typeof sent === 'string') setEmail(sent.trim())
    startTransition(() => dispatch(form))
  }

  // Typing in a field clears its line; the next submit checks again.
  const clearField = useCallback((name: FieldName) => {
    setFieldErrors((errors) => (errors[name] ? { ...errors, [name]: undefined } : errors))
  }, [])

  const rejected = state.status === 'error' && state.code === 'AUTH_CAPTCHA_FAILED'
  const busy = pending || checking
  return {
    state,
    pending: busy,
    onSubmit,
    captchaEnabled: captcha.enabled,
    // "Verification didn't complete. Please try again." under the form.
    captchaFailed: !busy && (captchaUnfinished || rejected),
    // The server's answer for the notice above the form; a captcha failure has its own line.
    errorCode: (state.status === 'error' && !rejected ? state.code : null) as ErrorCode | null,
    fieldErrors,
    clearField,
    email,
  }
}

export type AuthForm = ReturnType<typeof useAuthForm>
