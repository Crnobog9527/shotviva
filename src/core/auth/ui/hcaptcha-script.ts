import { CAPTCHA_NETWORK_ERROR, hcaptchaLanguage } from './captcha-light'

// Minimal typing of the hCaptcha browser API we use.
export type HCaptchaApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string
  execute(widgetId: string, options: { async: true }): Promise<{ response: string }>
  reset(widgetId?: string): void
  remove(widgetId: string): void
}

// hCaptcha calls this (the `onload` in the script URL) once its API is fully ready. The script
// element's own load event comes earlier, and a widget rendered then can misbehave (hCaptcha warns
// "should not render before js api is fully loaded").
const READY_CALLBACK = '__shotvivaHCaptchaReady'

declare global {
  interface Window {
    hcaptcha?: HCaptchaApi
    [READY_CALLBACK]?: () => void
  }
}

const SCRIPT_ID = 'hcaptcha-api'
const LOAD_TIMEOUT_MS = 15_000

// See captcha-light.ts: the forms tell this error apart by its name.
export class CaptchaNetworkError extends Error {
  override name = CAPTCHA_NETWORK_ERROR
}

export { hcaptchaLanguage }

export function scriptSrc(language: string): string {
  return `https://js.hcaptcha.com/1/api.js?render=explicit&onload=${READY_CALLBACK}&hl=${encodeURIComponent(language)}`
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
    window[READY_CALLBACK] = () => {
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
