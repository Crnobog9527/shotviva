import type { Locale } from '../../i18n/locales'

// Minimal typing of the hCaptcha browser API we use.
export type HCaptchaApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string
  execute(widgetId: string, options: { async: true }): Promise<{ response: string }>
  reset(widgetId?: string): void
  remove(widgetId: string): void
}

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi
  }
}

const SCRIPT_ID = 'hcaptcha-api'
const LOAD_TIMEOUT_MS = 15_000

// The script or the check could not get through: a slow or blocked network (from mainland China
// the TLS handshake to hCaptcha alone sometimes takes 4 s), not a failed challenge. The form says
// so and offers a retry.
export class CaptchaNetworkError extends Error {}

// hCaptcha's own language codes. Without `hl` it follows the browser, which put a Chinese
// challenge on English pages for a Chinese-language browser (ARCHITECTURE §7: it follows the page).
const LANGUAGES: Record<Locale, string> = { en: 'en', zh: 'zh-CN' }

export function hcaptchaLanguage(locale: Locale): string {
  return LANGUAGES[locale]
}

export function scriptSrc(language: string): string {
  return `https://js.hcaptcha.com/1/api.js?render=explicit&hl=${encodeURIComponent(language)}`
}

let loading: { language: string; api: Promise<HCaptchaApi> } | null = null

// Loaded once the sign-in page has settled or the visitor first touches it (use-captcha-warmup),
// so the script is in hand by the time they submit; pages without a captcha form never load it.
// The language is fixed when the script loads, so a page in the other language loads it again.
export function loadHCaptcha(language: string): Promise<HCaptchaApi> {
  if (loading?.language === language) return loading.api
  document.getElementById(SCRIPT_ID)?.remove()
  delete window.hcaptcha
  const api = new Promise<HCaptchaApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = scriptSrc(language)
    script.async = true
    const timer = setTimeout(() => fail(new CaptchaNetworkError('hCaptcha load timeout')), LOAD_TIMEOUT_MS)
    function fail(error: Error) {
      clearTimeout(timer)
      script.remove()
      loading = null
      reject(error)
    }
    script.onload = () => {
      clearTimeout(timer)
      if (window.hcaptcha) resolve(window.hcaptcha)
      else fail(new Error('hCaptcha missing after load'))
    }
    script.onerror = () => fail(new CaptchaNetworkError('hCaptcha failed to load'))
    document.head.appendChild(script)
  })
  loading = { language, api }
  return api
}
