import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMemoryStore } from '../../../../tests/fakes/memory-store'
import { preparePanelSummary } from './test-panel'
import { thumbnailKey } from './test-thumbnail'

vi.mock('./test-run-store', () => ({
  listTestPhotos: async () => [{ id: 'first', objectKey: 'first', lastUsedAt: '' }, { id: 'second', objectKey: 'second', lastUsedAt: '' }],
  loadTestBudget: async () => ({ budgetUsd: 10, spentUsd: 1, runs: 1, day: '2026-11-10' }),
}))

it('delivers the budget and original URLs without waiting for R2, then identifies only the missing WebP', async () => {
  const { store } = createMemoryStore()
  const gate = Promise.withResolvers<void>()
  const head = vi.spyOn(store, 'head').mockImplementation(async key => {
    await gate.promise
    return key === thumbnailKey('first') ? null : { size: 12, contentType: 'image/webp' }
  })
  const opening = preparePanelSummary({ db: {} as SupabaseClient, store })
  const previews = opening.previews()
  const summary = await opening.summary
  expect(summary.budget.spentUsd).toBe(1)
  expect(summary.recentPhotos[0].originalUrl).toContain('/first?')
  expect(head).toHaveBeenCalledTimes(2)
  gate.resolve()
  expect((await previews).map(photo => photo.thumbnailMissing)).toEqual([true, false])
})

it('retains the signed thumbnail and original fallback when R2 HEAD fails', async () => {
  const { store } = createMemoryStore()
  vi.spyOn(store, 'head').mockRejectedValue(new Error('R2 unavailable'))
  const { previews } = preparePanelSummary({ db: {} as SupabaseClient, store })
  expect(await previews()).toEqual(expect.arrayContaining([expect.objectContaining({
    thumbnailMissing: false, url: expect.stringContaining('first.thumb.webp'), originalUrl: expect.stringContaining('/first?'),
  })]))
})
