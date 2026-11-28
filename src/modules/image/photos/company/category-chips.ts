// The company view's category chips are read on the first screen only (one aggregate over the
// scope's works, migration 2040). Load more's address carries what that read found, so the pages
// after it draw the same rail without asking again: `<total>~<key>.<works>~<key>.<works>`.
// It only ever draws the reader's own rail: a changed value changes what they see, nothing else,
// and a key that is not a category is dropped by the caller.
export type CarriedChips = { total: number; chips: { key: string; works: number }[] }

const KEY = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/
const MAX_CHIPS = 40
const MAX_COUNT = 10_000_000

const count = (text: string | undefined): number | null => {
  if (!text || !/^\d{1,8}$/.test(text)) return null
  const value = Number(text)
  return value <= MAX_COUNT ? value : null
}

export function encodeChips(total: number, chips: readonly { key: string; works: number }[]): string {
  return [String(total), ...chips.slice(0, MAX_CHIPS).map((chip) => `${chip.key}.${chip.works}`)].join('~')
}

const chipOf = (part: string): CarriedChips['chips'][number] | null => {
  const dot = part.lastIndexOf('.')
  const key = part.slice(0, dot)
  const works = count(part.slice(dot + 1))
  return dot < 1 || !KEY.test(key) || key.length > 64 || works === null ? null : { key, works }
}

export function decodeChips(value: unknown): CarriedChips | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2000) return null
  const [head, ...rest] = value.split('~')
  const total = count(head)
  if (total === null || rest.length > MAX_CHIPS) return null
  const chips = rest.map(chipOf)
  return chips.every((chip) => chip !== null) ? { total, chips } : null
}
