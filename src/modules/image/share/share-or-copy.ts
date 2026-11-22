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

async function copyText(value: string): Promise<boolean> {
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
