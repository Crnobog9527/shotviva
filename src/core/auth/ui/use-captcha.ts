'use client'

import { useLocale } from 'next-intl'
import { useCallback } from 'react'

import { isLocale } from '../../i18n/locales'
import { publicEnv } from '../../public-env'
import { hcaptchaLanguage, invisibleToken } from './hcaptcha-script'

// Invisible only (ARCHITECTURE §7, Owner 2026-11-07): no widget on our page. The token is asked
// for on submit; a challenge, when hCaptcha wants one, is its own popup, in the page's language.
// undefined = captcha off (no site key); null = it did not complete (closed, expired, failed,
// or the script could not load), and the form says so and waits for the next submit.
export function useCaptcha(siteKey: string = publicEnv.NEXT_PUBLIC_HCAPTCHA_SITEKEY) {
  const locale = useLocale()
  const language = hcaptchaLanguage(isLocale(locale) ? locale : 'en')

  const getToken = useCallback(async (): Promise<string | undefined | null> => {
    if (!siteKey) return undefined
    try {
      return await invisibleToken(siteKey, language)
    } catch {
      return null
    }
  }, [siteKey, language])

  return { enabled: Boolean(siteKey), getToken }
}
