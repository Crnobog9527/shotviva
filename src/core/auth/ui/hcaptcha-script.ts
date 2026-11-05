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

const SCRIPT_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit'
const LOAD_TIMEOUT_MS = 15_000

let loading: Promise<HCaptchaApi> | null = null

// Loaded on first submit, not on page load, so visitors who never sign in skip it.
export function loadHCaptcha(): Promise<HCaptchaApi> {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha)
  loading ??= new Promise<HCaptchaApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
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
  return loading
}

// One fresh invisible widget per attempt: tokens are single use.
export async function invisibleToken(siteKey: string): Promise<string> {
  const api = await loadHCaptcha()
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  let widgetId: string | undefined
  try {
    widgetId = api.render(holder, { sitekey: siteKey, size: 'invisible' })
    const { response } = await api.execute(widgetId, { async: true })
    if (!response) throw new Error('empty hCaptcha response')
    return response
  } finally {
    if (widgetId !== undefined) api.remove(widgetId)
    holder.remove()
  }
}
