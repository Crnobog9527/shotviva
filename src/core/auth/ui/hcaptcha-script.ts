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

// Loaded on first submit, not on page load, so visitors who never sign in skip it. The language
// is fixed when the script loads, so a page in the other language loads it again.
export function loadHCaptcha(language: string): Promise<HCaptchaApi> {
  if (loading?.language === language) return loading.api
  document.getElementById(SCRIPT_ID)?.remove()
  delete window.hcaptcha
  const api = new Promise<HCaptchaApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = scriptSrc(language)
    script.async = true
    const timer = setTimeout(() => fail(new Error('hCaptcha load timeout')), LOAD_TIMEOUT_MS)
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
    script.onerror = () => fail(new Error('hCaptcha failed to load'))
    document.head.appendChild(script)
  })
  loading = { language, api }
  return api
}

// One fresh invisible widget per attempt: tokens are single use. When hCaptcha wants a challenge
// it opens its own popup; closing it, letting it expire or failing it rejects (the caller says
// "try again" under the form). Nothing is ever drawn on our page.
export async function invisibleToken(siteKey: string, language: string): Promise<string> {
  const api = await loadHCaptcha(language)
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  let widgetId: string | undefined
  try {
    widgetId = api.render(holder, { sitekey: siteKey, size: 'invisible', hl: language })
    const { response } = await api.execute(widgetId, { async: true })
    if (!response) throw new Error('empty hCaptcha response')
    return response
  } finally {
    if (widgetId !== undefined) api.remove(widgetId)
    holder.remove()
  }
}
