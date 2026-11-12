'use client'

import { useLocale } from 'next-intl'
import { useCallback } from 'react'

import { isLocale } from '../../i18n/locales'
import { publicEnv } from '../../public-env'
import { CAPTCHA_NETWORK_ERROR, hcaptchaLanguage, isCaptchaNetworkError, retainCaptcha } from './captcha-light'

// The loader and the widget come on demand (the warm-up or the first submit), never in a page's
// first JavaScript. A chunk that cannot load is a network problem like any other.
const widget = () => import('./hcaptcha-widget')

function networkError(): Error {
  const error = new Error('hCaptcha code could not load')
  error.name = CAPTCHA_NETWORK_ERROR
  return error
}

// `off`: no site key. `failed`: the challenge was closed, expired or failed. `network`: the script
// or the check could not get through in time (slow or blocked network).
export type CaptchaOutcome = { status: 'token'; token: string } | { status: 'off' } | { status: 'failed' | 'network' }

// Invisible only (ARCHITECTURE §7, Owner 2026-11-07): no widget on our page. The script and the
// invisible widget are prepared ahead (use-captcha-warmup); the token is asked for on submit; a
// challenge, when hCaptcha wants one, is its own popup, in the page's language.
export function useCaptcha(siteKey: string = publicEnv.NEXT_PUBLIC_HCAPTCHA_SITEKEY) {
  const locale = useLocale()
  const language = hcaptchaLanguage(isLocale(locale) ? locale : 'en')

  // `onChallenge`: hCaptcha opened its own challenge window, which the visitor now has to finish.
  const tryToken = useCallback(async (onChallenge?: () => void): Promise<CaptchaOutcome> => {
    if (!siteKey) return { status: 'off' }
    try {
      const { invisibleToken } = await widget().catch(() => Promise.reject(networkError()))
      return { status: 'token', token: await invisibleToken(siteKey, language, onChallenge) }
    } catch (error) {
      return { status: isCaptchaNetworkError(error) ? 'network' : 'failed' }
    }
  }, [siteKey, language])

  // undefined = captcha off; null = it did not complete.
  const getToken = useCallback(async (): Promise<string | undefined | null> => {
    const outcome = await tryToken()
    if (outcome.status === 'token') return outcome.token
    return outcome.status === 'off' ? undefined : null
  }, [tryToken])

  const prepare = useCallback(() => {
    if (siteKey) widget().then((m) => m.prepareHCaptcha(siteKey, language)).catch(() => undefined)
  }, [siteKey, language])

  // A form that may submit holds the prepared widget while it is mounted (release on unmount).
  const retain = useCallback(
    () => (siteKey ? retainCaptcha(() => void widget().then((m) => m.releaseWarm(), () => undefined)) : () => undefined),
    [siteKey],
  )

  return { enabled: Boolean(siteKey), getToken, tryToken, prepare, retain }
}
