'use client'

import { useEffect } from 'react'
import { preconnect } from 'react-dom'

// hCaptcha's script host and the host of its frame. The handshake alone took 1.3–2.4 s from
// mainland China (2026-11-12); a preconnect in the page head does it while the page loads.
const CAPTCHA_ORIGINS = ['https://js.hcaptcha.com', 'https://newassets.hcaptcha.com'] as const

// The first sign the visitor is about to use the form.
const INTENT_EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart'] as const
// After the page has loaded and painted, so the check never competes with the first screen.
const AFTER_LOAD_MS = 1500

// Prepares the invisible check early on a page with a captcha form: once the page has loaded, or
// at the visitor's first touch or key press if that comes sooner. From mainland China the
// script and its frame take about 5 s; prepared while the visitor types, the submit answers in
// well under a second instead of leaving the button looking dead.
type Warmable = { prepare(): void; retain(): () => void }

// While mounted, the form holds the prepared widget (removed when the last form goes).
export function useCaptchaWarmup({ prepare, retain }: Warmable, active: boolean) {
  if (active) for (const origin of CAPTCHA_ORIGINS) preconnect(origin)
  useEffect(() => {
    if (!active) return
    const release = retain()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      clearTimeout(timer)
      window.removeEventListener('load', onLoad)
      for (const type of INTENT_EVENTS) window.removeEventListener(type, go, true)
    }
    function go() {
      stop()
      prepare()
    }
    function onLoad() {
      timer = setTimeout(go, AFTER_LOAD_MS)
    }
    for (const type of INTENT_EVENTS) window.addEventListener(type, go, { capture: true, passive: true })
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad)
    return () => {
      stop()
      release()
    }
  }, [prepare, retain, active])
}
