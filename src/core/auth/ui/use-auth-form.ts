'use client'

import { startTransition, useActionState, useCallback, useState, type FormEvent } from 'react'

import type { ErrorCode } from '../../errors'
import { IDLE, type FormState } from '../flows/form-state'
import { useCaptchaStep } from './use-captcha-step'
import { useSlow } from './use-slow'
import type { FieldErrors, FieldName } from './validate'

export type FormAction = (state: FormState, form: FormData) => Promise<FormState>

type Options = { captcha: boolean; validate?: (form: FormData) => FieldErrors | null }

// Wraps a server action: checks the fields in the browser first, asks hCaptcha for an invisible
// token (when the form needs one, prepared ahead by the warm-up) and attaches it. While it works
// a status line says what it is waiting for, and says so again when the network is slow. A check
// that did not complete, here or at Supabase, becomes one line under the form (with a retry when
// the network was the cause); the next submit asks again. Keeps the address it last sent, for the
// "check your email" views.
export function useAuthForm(action: FormAction, { captcha: needsCaptcha, validate }: Options) {
  const [state, dispatch, pending] = useActionState(action, IDLE)
  const captcha = useCaptchaStep(needsCaptcha)
  const { checking, miss } = captcha
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [email, setEmail] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking || pending) return
    const form = new FormData(event.currentTarget)
    const invalid = validate?.(form) ?? null
    setFieldErrors(invalid ?? {})
    if (invalid) return
    if (!(await captcha.attachToken(form))) return
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
  const slow = useSlow(busy)
  return {
    state,
    pending: busy,
    onSubmit,
    captchaEnabled: captcha.enabled,
    // "Verification didn't complete. Please try again." under the form.
    captchaFailed: !busy && (miss !== null || rejected),
    // The network, not the challenge: "couldn't load … Try again".
    captchaNetwork: !busy && miss === 'network',
    // What the status line under the button says while the form works.
    phase: phaseOf(checking, pending),
    slow,
    // The server's answer for the notice above the form; a captcha failure has its own line.
    errorCode: (state.status === 'error' && !rejected ? state.code : null) as ErrorCode | null,
    fieldErrors,
    clearField,
    email,
  }
}

function phaseOf(checking: boolean, pending: boolean): 'checking' | 'sending' | null {
  if (checking) return 'checking'
  return pending ? 'sending' : null
}

export type AuthForm = ReturnType<typeof useAuthForm>
