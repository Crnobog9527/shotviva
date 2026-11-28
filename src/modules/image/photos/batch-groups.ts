import type { PhotoItem } from './photo-item'

// Photos' Done list with batches gathered (T107 「作品页按批次归组」): newest first as before, and
// a batch of two or more finished photos becomes one group where its newest photo would be, its
// photos in their batch order. A batch with one photo left (the rest deleted or failed) is an
// ordinary photo again.
export type DoneEntry = { kind: 'photo'; item: PhotoItem } | { kind: 'batch'; batchId: string; items: PhotoItem[]; templates: number; paid: number }

export function groupByBatch(items: readonly PhotoItem[]): DoneEntry[] {
  const batches = new Map<string, PhotoItem[]>()
  for (const item of items) {
    if (item.batchId) batches.set(item.batchId, [...(batches.get(item.batchId) ?? []), item])
  }
  const placed = new Set<string>()
  const entries: DoneEntry[] = []
  for (const item of items) {
    const members = item.batchId ? (batches.get(item.batchId) ?? []) : []
    if (!item.batchId || members.length < 2) {
      entries.push({ kind: 'photo', item })
      continue
    }
    if (placed.has(item.batchId)) continue
    placed.add(item.batchId)
    const ordered = [...members].sort(batchOrder)
    entries.push({
      kind: 'batch',
      batchId: item.batchId,
      items: ordered,
      templates: new Set(ordered.map((member) => member.templateId)).size,
      paid: ordered.filter((member) => member.creditPool === 'paid').length,
    })
  }
  return entries
}

// Batch order is the cell order the batch was planned in (batch_position); a row without one
// (made before positions were stored) falls back to the order it was made in.
function batchOrder(a: PhotoItem, b: PhotoItem): number {
  if (a.batchPosition !== null && b.batchPosition !== null && a.batchPosition !== b.batchPosition) return a.batchPosition - b.batchPosition
  return a.createdAt.localeCompare(b.createdAt)
}

// Where each visible cell comes in the grid, 0 first: a photo outside a batch has its own cell and
// a batch has one (its stack), however many photos it holds. The first screen's pictures are
// picked by this order (done-card.tsx): a closed batch's photos are not on screen and must not
// take those slots. Keyed by the photo's id, or the batch's id for a stack.
export function cellPlaces(entries: readonly DoneEntry[]): Map<string, number> {
  return new Map(entries.map((entry, index) => [entry.kind === 'photo' ? entry.item.id : entry.batchId, index]))
}

// The Done list cut into calendar days in the viewer's time zone, newest first (2026-11-28; it
// was cut by month, which told nothing while every work was a few weeks old): a batch sits in
// the day of its newest photo, where it stands in the list. key is "2026-11-28"; count is the
// photos in the section, a batch counted by its photos.
export type DaySection = { key: string; first: string; entries: DoneEntry[]; count: number }

export function groupByDay(entries: readonly DoneEntry[], timeZone: string): DaySection[] {
  const dayOf = dayKeyIn(timeZone)
  const sections: DaySection[] = []
  for (const entry of entries) {
    const first = entry.kind === 'photo' ? entry.item.createdAt : newest(entry.items)
    const size = entry.kind === 'photo' ? 1 : entry.items.length
    const key = dayOf(first)
    const last = sections.at(-1)
    if (last?.key === key) {
      last.entries.push(entry)
      last.count += size
    } else sections.push({ key, first, entries: [entry], count: size })
  }
  return sections
}

// "2026-11-28" for an instant, in `timeZone` (en-CA writes dates that way). One formatter per list.
export function dayKeyIn(timeZone: string): (iso: string | Date) => string {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  return (iso) => format.format(typeof iso === 'string' ? new Date(iso) : iso)
}

const newest = (items: readonly PhotoItem[]) => items.reduce((a, item) => (item.createdAt > a ? item.createdAt : a), items[0]!.createdAt)
