import 'server-only'

import { z } from 'zod'

import { logger } from '../logger'

// The business inquiry form's invisible hCaptcha (ARCHITECTURE §10.c), checked on our server:
// sign-up and sign-in hand their token to Supabase Auth, but this form has no Auth call. On when
// the site key (the browser asks for a token) and the secret are both set, which is production
// (ARCHITECTURE §7); production with the site key but no secret refuses every send.

const VERIFY_URL = 'https://api.hcaptcha.com/siteverify'
const TIMEOUT_MS = 5000

export type CaptchaConfig = { secret: string; siteKey: string }
// true: a person; false: no token, or hCaptcha said no.
export type CaptchaCheck = (token: string | null, ip: string | null) => Promise<boolean>

const answer = z.object({ success: z.boolean() })

type Fetch = (input: string, init: RequestInit) => Promise<Response>

async function answerOf(response: Response): Promise<boolean> {
  if (!response.ok) {
    logger.error('hcaptcha siteverify refused the call; inquiry rejected', { status: response.status })
    return false
  }
  try {
    const parsed = answer.safeParse(JSON.parse(await response.text()))
    if (parsed.success) return parsed.data.success
  } catch {
    // Not JSON: treated like an unreadable answer below.
  }
  logger.error('hcaptcha siteverify answered something unreadable; inquiry rejected')
  return false
}

// Fails open only when hCaptcha cannot be reached (timeout, network): the per-IP and per-email
// limits still hold. An error status or an unreadable answer fails closed.
export function captchaCheck(config: CaptchaConfig, fetcher: Fetch = fetch): CaptchaCheck {
  return async (token, ip) => {
    if (!token) return false
    const body = new URLSearchParams({ secret: config.secret, response: token, sitekey: config.siteKey })
    if (ip) body.set('remoteip', ip)
    let response: Response
    try {
      response = await fetcher(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      logger.warn('hcaptcha siteverify unreachable; inquiry accepted without it', { error })
      return true
    }
    return answerOf(response)
  }
}

export type CaptchaEnv = { secret: string | undefined; siteKey: string; production: boolean }

// on: check every send. off: no site key (the browser asks for no token), or a test environment
// with a site key but no secret. closed: production with a site key but no secret, where every
// send is refused rather than let through unchecked.
export type CaptchaMode = { mode: 'on'; config: CaptchaConfig } | { mode: 'off' } | { mode: 'closed' }

export function captchaMode(env: CaptchaEnv): CaptchaMode {
  if (!env.siteKey) return { mode: 'off' }
  if (env.secret) return { mode: 'on', config: { secret: env.secret, siteKey: env.siteKey } }
  return env.production ? { mode: 'closed' } : { mode: 'off' }
}

let warned = false

// A site key without the secret is a setup mistake wherever it happens: said once per instance
// (and on every refused send in production, by the caller).
export function warnMissingSecret(env: CaptchaEnv): void {
  if (warned || !env.siteKey || env.secret) return
  warned = true
  logger.error('HCAPTCHA_SECRET is not set but NEXT_PUBLIC_HCAPTCHA_SITEKEY is', { production: env.production })
}
