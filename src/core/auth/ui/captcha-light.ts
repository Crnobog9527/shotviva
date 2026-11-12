import type { Locale } from '../../i18n/locales'

// The part of the hCaptcha code every sign-in form needs at once: the page's hCaptcha language,
// the network-error name and how many forms hold the prepared widget. The loader and the widget
// (hcaptcha-script.ts, hcaptcha-widget.ts) are fetched on demand by use-captcha.ts, so a page
// that only shares components with the sign-in forms (the account page) never downloads them.

// hCaptcha's own language codes. Without `hl` it follows the browser, which put a Chinese
// challenge on English pages for a Chinese-language browser (ARCHITECTURE §7: it follows the page).
const LANGUAGES: Record<Locale, string> = { en: 'en', zh: 'zh-CN' }

export function hcaptchaLanguage(locale: Locale): string {
  return LANGUAGES[locale]
}

// The script or the check could not get through: a slow or blocked network (from mainland China
// the TLS handshake to hCaptcha alone sometimes takes 4 s), not a failed challenge. The form says
// so and offers a retry. Matched by name, so this file need not load the class.
export const CAPTCHA_NETWORK_ERROR = 'CaptchaNetworkError'

export function isCaptchaNetworkError(error: unknown): boolean {
  return error instanceof Error && error.name === CAPTCHA_NETWORK_ERROR
}

// Forms that may submit hold the prepared widget; when the last one unmounts (signed in, moved on
// to another page) `onLastRelease` removes it, so no hidden hCaptcha frame stays on the pages
// after. The release waits a tick: a form swapped for another (log-in → check your email) holds it
// again first.
let holders = 0

export function captchaHolders(): number {
  return holders
}

export function retainCaptcha(onLastRelease: () => void): () => void {
  holders += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holders -= 1
    setTimeout(() => {
      if (holders === 0) onLastRelease()
    }, 0)
  }
}
