import { CAPTCHA_NETWORK_ERROR } from './captcha-light'

type WidgetModule = typeof import('./hcaptcha-widget')
type Importer = () => Promise<WidgetModule>

// The chunk download has no clock of its own: the bundler's loader only fails on a network error,
// and a stalled connection (common from mainland China) never errors. Past this the form says
// the network is slow and offers a retry, like the hCaptcha script's own 15 s.
export const WIDGET_LOAD_TIMEOUT_MS = 15_000

const importWidget: Importer = () => import('./hcaptcha-widget')

let pending: Promise<WidgetModule> | null = null
let loaded: WidgetModule | null = null

export function captchaNetworkError(message: string): Error {
  const error = new Error(message)
  error.name = CAPTCHA_NETWORK_ERROR
  return error
}

// The hCaptcha loader and widget, fetched once; a download that fails or stalls is a network
// error and is forgotten, so the next warm-up or submit asks for it again.
export function loadWidget(importer: Importer = importWidget, timeoutMs: number = WIDGET_LOAD_TIMEOUT_MS): Promise<WidgetModule> {
  if (loaded) return Promise.resolve(loaded)
  if (pending) return pending
  const attempt: Promise<WidgetModule> = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(captchaNetworkError('hCaptcha code load timeout')), timeoutMs)
    importer().then(
      (module) => {
        clearTimeout(timer)
        loaded = module
        resolve(module)
      },
      () => {
        clearTimeout(timer)
        reject(captchaNetworkError('hCaptcha code could not load'))
      },
    )
  })
  pending = attempt
  attempt.catch(() => {
    if (pending === attempt) pending = null
  })
  return attempt
}

// The module if it has already arrived, without starting a download (a form that unmounts before
// the warm-up fetched it has nothing to release).
export function loadedWidget(): WidgetModule | null {
  return loaded
}
