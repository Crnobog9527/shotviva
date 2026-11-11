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
