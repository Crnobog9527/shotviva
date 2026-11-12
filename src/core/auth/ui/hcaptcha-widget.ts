import { captchaHolders } from './captcha-light'
import { CaptchaNetworkError, loadHCaptcha, type HCaptchaApi } from './hcaptcha-script'

// Without a challenge on screen a warm invisible check answers in about 0.3 s (measured from
// mainland China, 2026-11-12); past this the network is stuck, and the form offers a retry
// instead of a button that seems to do nothing. A challenge on screen has no clock: it is the
// visitor's to finish or close.
export const EXECUTE_TIMEOUT_MS = 15_000

type Widget = { key: string; api: HCaptchaApi; holder: HTMLElement; id: string; onOpen(): void }

// The one invisible widget rendered ahead of a submit. Rendering it fetches hCaptcha's frame and
// files, which from mainland China takes about 5 s; done while the visitor types, the submit
// only has to execute it.
let warm: { key: string; widget: Promise<Widget> } | null = null

const keyOf = (siteKey: string, language: string) => `${siteKey}|${language}`

async function createWidget(siteKey: string, language: string): Promise<Widget> {
  const api = await loadHCaptcha(language)
  const holder = document.createElement('div')
  document.body.appendChild(holder)
  const widget: Widget = { key: keyOf(siteKey, language), api, holder, id: '', onOpen: () => undefined }
  try {
    widget.id = api.render(holder, { sitekey: siteKey, size: 'invisible', hl: language, 'open-callback': () => widget.onOpen() })
  } catch (error) {
    holder.remove()
    throw error
  }
  return widget
}

function dispose(widget: Widget) {
  try {
    widget.api.remove(widget.id)
  } catch {
    // Already gone with a script reloaded for the other language.
  }
  widget.holder.remove()
}

// Loads the script and renders the widget, once per site key and language. A failure clears the
// slot, so the submit (or the next warm-up) tries the network again.
export function prepareHCaptcha(siteKey: string, language: string): Promise<void> {
  const key = keyOf(siteKey, language)
  if (warm?.key === key) return warm.widget.then(() => undefined)
  if (warm) void warm.widget.then(dispose, () => undefined)
  const slot = { key, widget: createWidget(siteKey, language) }
  warm = slot
  slot.widget.catch(() => {
    if (warm === slot) warm = null
  })
  return slot.widget.then(() => undefined)
}

// Called once the last form holding the widget has unmounted (captcha-light.ts retainCaptcha).
export function releaseWarm() {
  const slot = warm
  warm = null
  if (slot) void slot.widget.then(dispose, () => undefined)
}

// Tokens are single use, so each attempt takes the warm widget (or makes one) for itself.
function takeWidget(siteKey: string, language: string): Promise<Widget> {
  const key = keyOf(siteKey, language)
  if (warm?.key !== key) return createWidget(siteKey, language)
  const { widget } = warm
  warm = null
  return widget
}

function execute(widget: Widget, onChallenge?: () => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CaptchaNetworkError('hCaptcha execute timeout')), EXECUTE_TIMEOUT_MS)
    widget.onOpen = () => {
      clearTimeout(timer)
      onChallenge?.()
    }
    widget.api.execute(widget.id, { async: true }).then(
      ({ response }) => {
        clearTimeout(timer)
        if (response) resolve(response)
        else reject(new Error('empty hCaptcha response'))
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

// When hCaptcha wants a challenge it opens its own popup; closing it, letting it expire or failing
// it rejects (the caller says "try again" under the form); `onChallenge` hears when it opens.
// Nothing is ever drawn on our page.
export async function invisibleToken(siteKey: string, language: string, onChallenge?: () => void): Promise<string> {
  const widget = await takeWidget(siteKey, language)
  try {
    return await execute(widget, onChallenge)
  } finally {
    dispose(widget)
    // A retry (a wrong password, say) or a resend starts warm, while a form is still on the page;
    // once the last one unmounts (signed in, moved on) retainHCaptcha's release removes it.
    if (captchaHolders() > 0) prepareHCaptcha(siteKey, language).catch(() => undefined)
  }
}
