'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { publicEnv } from '../../public-env'
import { invisibleToken, loadHCaptcha } from './hcaptcha-script'

export type CaptchaMode = 'invisible' | 'checkbox'

// Invisible first (ARCHITECTURE §7). If it cannot produce a token, or Supabase rejects
// the token, the form switches to the visible checkbox and waits for the visitor.
export function useCaptcha(siteKey: string = publicEnv.NEXT_PUBLIC_HCAPTCHA_SITEKEY) {
  const [mode, setMode] = useState<CaptchaMode>('invisible')
  const checkboxToken = useRef<string | null>(null)
  const checkboxWidget = useRef<string | null>(null)
  // A state-held element (callback ref) so the effect re-runs once the slot mounts.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (mode !== 'checkbox' || !siteKey || !container) return
    let cancelled = false
    loadHCaptcha()
      .then((api) => {
        if (cancelled || checkboxWidget.current) return
        checkboxWidget.current = api.render(container, {
          sitekey: siteKey,
          callback: (token: string) => (checkboxToken.current = token),
          'expired-callback': () => (checkboxToken.current = null),
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mode, siteKey, container])

  // undefined = captcha off; null = the visitor still has to tick the checkbox.
  const getToken = useCallback(async (): Promise<string | undefined | null> => {
    if (!siteKey) return undefined
    if (mode === 'checkbox') return checkboxToken.current
    try {
      return await invisibleToken(siteKey)
    } catch {
      setMode('checkbox')
      return null
    }
  }, [mode, siteKey])

  // After each submit: a used checkbox token is spent, so clear the widget for the next try.
  const consumed = useCallback((rejected: boolean) => {
    if (rejected) setMode('checkbox')
    if (checkboxWidget.current && window.hcaptcha) window.hcaptcha.reset(checkboxWidget.current)
    checkboxToken.current = null
  }, [])

  return { enabled: Boolean(siteKey), mode, mountCheckbox: setContainer, getToken, consumed }
}
