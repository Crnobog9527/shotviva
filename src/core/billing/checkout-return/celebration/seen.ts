// Once per payment (T55): the payment key goes into this browser's storage when the
// celebration starts, so a reload or a second visit to the return page shows the plate at rest.
// Only the last few keys are kept. Storage that throws (private mode, blocked) means "not seen":
// the worst case is one extra celebration, never a broken page.

const KEY = 'shotviva:celebrated'
const KEEP = 20

type Store = Pick<Storage, 'getItem' | 'setItem'>

function read(store: Store): string[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function hasCelebrated(store: Store, paymentKey: string): boolean {
  return read(store).includes(paymentKey)
}

export function markCelebrated(store: Store, paymentKey: string): void {
  try {
    const keys = [paymentKey, ...read(store).filter((key) => key !== paymentKey)].slice(0, KEEP)
    store.setItem(KEY, JSON.stringify(keys))
  } catch {
    // Storage refused: nothing to remember with.
  }
}
