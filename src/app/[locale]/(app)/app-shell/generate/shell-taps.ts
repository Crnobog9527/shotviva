// Taps on Create's app shell (ARCHITECTURE §18.3): the shell answers none. A tap on an open action
// on the whitelist is remembered by its stable key (the last one only) and replayed on the real
// page once that is shown, unless more than REPLAY_WITHIN_MS have passed. The whitelist: open a
// template card or a series (data-card: template id, series:slug), switch a category or the Saved
// chip, See all (data-open). Anything else (spending credits, submitting, deleting, saving a
// favourite, uploading, sharing, buying, any link) is dropped, silently.
export const REPLAY_WITHIN_MS = 10_000

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="checkbox"], [role="switch"]'

export function shellTapKey(target: EventTarget | null): string | null {
  if (!target || typeof (target as Element).closest !== 'function') return null
  // The control the tap landed on must itself be the open action: a heart or any other button
  // inside a card is not the card.
  const control = (target as Element).closest(INTERACTIVE)
  if (control && !control.matches('[data-card], [data-open]')) return null
  const element = (target as Element).closest('[data-card], [data-open]')
  if (!element) return null
  const card = element.getAttribute('data-card')
  if (card) return `card:${card}`
  const open = element.getAttribute('data-open')
  return open ? `open:${open}` : null
}

// An attribute value inside a double-quoted selector.
const quoted = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`

export function tapTarget(root: ParentNode, key: string): HTMLElement | null {
  const [kind, ...rest] = key.split(':')
  const value = rest.join(':')
  const selector = kind === 'card' ? `[data-card=${quoted(value)}]` : kind === 'open' ? `[data-open=${quoted(value)}]` : null
  if (!selector) return null
  for (const element of root.querySelectorAll<HTMLElement>(selector)) {
    if (element.closest('[data-app-shell]')) continue
    // A card that is not itself a button (the Art Styles compare): its dialog button.
    return element.matches('button, a') ? element : (element.querySelector<HTMLElement>('button[aria-haspopup="dialog"]') ?? element)
  }
  return null
}

// The remembered tap, replayed if still fresh.
export function replayTap(tap: { key: string; at: number }, now: number, root: ParentNode = document): void {
  if (now - tap.at > REPLAY_WITHIN_MS) return
  tapTarget(root, tap.key)?.click()
}
