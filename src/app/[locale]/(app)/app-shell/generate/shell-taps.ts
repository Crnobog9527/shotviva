// Taps on Create's app shell (ARCHITECTURE §18.3): the shell answers none, it remembers the last
// one by a stable key and replays it on the real page once that is shown. Keys: a card's
// data-card (template id, series:slug), a link's address, a button's accessible name.

export function shellTapKey(target: EventTarget | null): string | null {
  const element = target && typeof (target as Element).closest === 'function' ? (target as Element).closest('[data-card], a[href], button[aria-label]') : null
  if (!element) return null
  const card = element.getAttribute('data-card')
  if (card) return `card:${card}`
  const href = element.getAttribute('href')
  if (href) return `href:${href}`
  const label = element.getAttribute('aria-label')
  return label ? `label:${label}` : null
}

// The real page's element for a key, outside any shell still on the page; null when there is none.
// An attribute value inside a double-quoted selector.
const quoted = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`

export function tapTarget(root: ParentNode, key: string): HTMLElement | null {
  const [kind, ...rest] = key.split(':')
  const value = rest.join(':')
  const selector = kind === 'card' ? `[data-card=${quoted(value)}]` : kind === 'href' ? `a[href=${quoted(value)}]` : kind === 'label' ? `button[aria-label=${quoted(value)}]` : null
  if (!selector) return null
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.closest('[data-app-shell]')) continue
    // A card that is not itself a button (the Art Styles compare): its dialog button.
    return element.matches('button, a') ? element : (element.querySelector<HTMLElement>('button[aria-haspopup="dialog"]') ?? element)
  }
  return null
}

export function replayTap(key: string, root: ParentNode = document): void {
  tapTarget(root, key)?.click()
}
