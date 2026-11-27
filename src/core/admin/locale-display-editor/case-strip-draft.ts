import { CASE_STRIP_MAX, type CaseStripEntry } from '@/core/templates/home-case-strip'

// One language's 「更多真实案例」 while the admin arranges it: a list of entries, each kept in the
// sortable list under a key that says what it is ('t:' a template, 'b:' a 精选组合).

export const keyOf = (entry: CaseStripEntry) => `${entry.kind === 'template' ? 't' : 'b'}:${entry.id}`
export const entryOf = (key: string): CaseStripEntry =>
  ({ kind: key.startsWith('b:') ? 'bundle' : 'template', id: key.slice(2) })

// Appends the entries not already there, in the order given, up to the eight slots.
export function addEntries(list: readonly CaseStripEntry[], added: readonly CaseStripEntry[]): CaseStripEntry[] {
  const keys = new Set(list.map(keyOf))
  const fresh = added.filter((entry) => {
    const key = keyOf(entry)
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })
  return [...list, ...fresh].slice(0, CASE_STRIP_MAX)
}

export const removeEntry = (list: readonly CaseStripEntry[], key: string) => list.filter((entry) => keyOf(entry) !== key)

export const reorderEntries = (keys: readonly string[]) => keys.map(entryOf)

export const sameEntries = (a: readonly CaseStripEntry[], b: readonly CaseStripEntry[]) =>
  a.map(keyOf).join('\n') === b.map(keyOf).join('\n')

export const slotsLeft = (list: readonly CaseStripEntry[]) => Math.max(0, CASE_STRIP_MAX - list.length)
