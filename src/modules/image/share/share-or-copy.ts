// Shared by the template share button and the collection share sheet.

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

// The phone's share sheet where there is one and the screen is a touch screen (a desktop
// browser's share dialog is less useful than a copied link); a cancelled sheet does nothing.
export async function shareOrCopy(url: string, data: { title: string; text: string }): Promise<ShareOutcome> {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ ...data, url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}

type ShareEnv = { share?: (data: ShareData) => Promise<void>; copy(value: string): Promise<boolean> }

// 「分享链接」 on a made link (Owner 2026-11-23): the system share sheet wherever the browser has
// one, desktop included, so WeChat or any other app can be picked. No sheet, or one that fails
// for any reason but the user closing it, copies the link instead.
export async function shareLink(url: string, data: { title: string; text: string }, env: ShareEnv = browserShareEnv()): Promise<ShareOutcome> {
  if (env.share) {
    try {
      await env.share({ ...data, url })
      return 'shared'
    } catch (error) {
      if (isAbort(error)) return 'cancelled'
    }
  }
  return (await env.copy(url)) ? 'copied' : 'failed'
}

const isAbort = (error: unknown) => typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'

function browserShareEnv(): ShareEnv {
  return { share: typeof navigator.share === 'function' ? (data) => navigator.share(data) : undefined, copy: copyText }
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Older WebViews (WeChat) without the async clipboard: a hidden field and the copy command.
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;opacity:0'
    document.body.append(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}
