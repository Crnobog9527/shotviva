'use client'

import { useState } from 'react'

import { useCaptcha } from './use-captcha'
import { useCaptchaWarmup } from './use-captcha-warmup'

// The captcha half of a sign-in form: prepared ahead on pages that need it, asked on submit.
// `miss` is why the last check did not complete, until the next one starts.
export function useCaptchaStep(needed: boolean) {
  const captcha = useCaptcha()
  const [checking, setChecking] = useState(false)
  const [miss, setMiss] = useState<'failed' | 'network' | null>(null)
  // hCaptcha's challenge window is open: the wait is the visitor's, not the network's.
  const [challenge, setChallenge] = useState(false)

  useCaptchaWarmup(captcha.prepare, needed && captcha.enabled)

  // false when the check did not complete; true when there is a token or captcha is off.
  async function attachToken(form: FormData): Promise<boolean> {
    if (!needed) return true
    setChecking(true)
    const outcome = await captcha.tryToken(() => setChallenge(true))
    setChecking(false)
    setChallenge(false)
    const missed = outcome.status === 'failed' || outcome.status === 'network' ? outcome.status : null
    setMiss(missed)
    if (outcome.status === 'token') form.set('captchaToken', outcome.token)
    return missed === null
  }

  return { enabled: captcha.enabled, checking, challenge, miss, attachToken }
}
