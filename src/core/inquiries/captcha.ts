import 'server-only'

import { z } from 'zod'

import { logger } from '../logger'

// The business inquiry form's invisible hCaptcha (ARCHITECTURE §10.c), checked on our server:
// sign-up and sign-in hand their token to Supabase Auth, but this form has no Auth call. On
// only when both the site key (the browser asks for a token) and the secret are set, which is
// production (ARCHITECTURE §7).

const VERIFY_URL = 'https://api.hcaptcha.com/siteverify'
const TIMEOUT_MS = 5000

export type CaptchaConfig = { secret: string; siteKey: string }
// true: a person; false: no token, or hCaptcha said no.
export type CaptchaCheck = (token: string | null, ip: string | null) => Promise<boolean>

const answer = z.object({ success: z.boolean() })

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export function captchaCheck(config: CaptchaConfig, fetcher: Fetch = fetch): CaptchaCheck {
  return async (token, ip) => {
    if (!token) return false
    const body = new URLSearchParams({ secret: config.secret, response: token, sitekey: config.siteKey })
    if (ip) body.set('remoteip', ip)
    try {
      const response = await fetcher(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) })
      const parsed = answer.safeParse(await response.json())
      return parsed.success && parsed.data.success
    } catch (error) {
      // hCaptcha unreachable: let the person through; the per-IP and per-email limits still hold.
      logger.warn('hcaptcha siteverify unreachable; inquiry accepted without it', { error })
      return true
    }
  }
}

export function captchaConfig(secret: string | undefined, siteKey: string): CaptchaConfig | null {
  return secret && siteKey ? { secret, siteKey } : null
}
