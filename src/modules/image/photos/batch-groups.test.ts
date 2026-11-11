import { describe, expect, it } from 'vitest'

import { groupByBatch } from './batch-groups'
import type { PhotoItem } from './photo-item'

const item = (id: string, createdAt: string, batchId: string | null, templateId = 'a', batchPosition: number | null = null): PhotoItem => ({
  id, templateId, templateName: templateId, cover: null, aspect: 'original', resolution: '1k', credits: 2,
  createdAt, creditPool: 'paid', visibility: 'private', fileUrl: `/api/files/${id}`, thumbUrl: `/api/files/${id}/thumb`, batchId, batchPosition,
})

describe('groupByBatch', () => {
  it('gathers a batch where its newest photo stands, in batch order, and counts its templates', () => {
    const list = [
      item('n', '2026-11-11T10:05:00Z', null),
      item('b3', '2026-11-11T10:03:00Z', 'B', 'y'),
      item('s', '2026-11-11T10:02:30Z', null),
      item('b1', '2026-11-11T10:01:00Z', 'B', 'x'),
      item('b2', '2026-11-11T10:02:00Z', 'B', 'x'),
    ]
    const entries = groupByBatch(list)
    expect(entries.map((entry) => entry.kind)).toEqual(['photo', 'batch', 'photo'])
    const batch = entries[1]
    expect(batch).toMatchObject({ kind: 'batch', batchId: 'B', templates: 2, paid: 3 })
    expect(batch?.kind === 'batch' && batch.items.map((member) => member.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('orders a batch by its planned cells, not by when each photo finished', () => {
    const list = [
      item('c0', '2026-11-11T10:04:00Z', 'B', 'x', 0),
      item('c2', '2026-11-11T10:03:00Z', 'B', 'x', 2),
      item('c1', '2026-11-11T10:05:00Z', 'B', 'x', 1),
    ]
    const [batch] = groupByBatch(list)
    expect(batch?.kind === 'batch' && batch.items.map((member) => member.id)).toEqual(['c0', 'c1', 'c2'])
  })

  it('leaves a batch with one photo left as an ordinary photo', () => {
    expect(groupByBatch([item('b1', '2026-11-11T10:01:00Z', 'B')])).toEqual([{ kind: 'photo', item: expect.objectContaining({ id: 'b1' }) }])
  })
})
