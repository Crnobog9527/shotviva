import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { row } = vi.hoisted(() => ({ row: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/providers', () => ({ findProvider: row }))
const { testRunEstimateUsd } = await import('./provider-estimate')
const { estimateRunUsd } = await import('./estimate')

describe('testRunEstimateUsd (what an admin trial books against the daily budget)', () => {
  const db = {} as SupabaseClient
  const id = randomUUID()
  const prices = { inputTextPerM: 5, inputImagePerM: 8, outputPerM: 30 }
  beforeEach(() => { vi.resetAllMocks() })

  it('books an Ark trial at its row’s per-image cost plus extra slot photos', async () => {
    row.mockResolvedValue({ id, adapter: 'ark_images', estimatedImageCosts: { '1k': 0.03, '2k': 0.045 }, extraInputImageUsd: 0.0075, prices: {} })
    expect(await testRunEstimateUsd(db, { id: `${id}/doubao-seedream-5-5-261028`, prices: null }, '2k', 'medium', 2)).toBe(0.0525)
    expect(row).toHaveBeenCalledWith(db, id)
  })

  it('leaves a gpt trial on the token estimate', async () => {
    row.mockResolvedValue({ id, adapter: 'openai_images', estimatedImageCosts: {}, extraInputImageUsd: 0.0125, prices })
    expect(await testRunEstimateUsd(db, { id: `${id}/gpt-image-2.6`, prices }, '1k', 'medium', 1)).toBe(estimateRunUsd('1k', 'medium', prices))
  })

  it('keeps the token estimate for an env provider or an unreadable row', async () => {
    expect(await testRunEstimateUsd(db, { id: 'env/gpt-image-2.6', prices: null }, '1k', 'medium', 1)).toBe(estimateRunUsd('1k', 'medium', null))
    expect(row).not.toHaveBeenCalled()
    row.mockRejectedValue(new Error('db down'))
    expect(await testRunEstimateUsd(db, { id: `${id}/x`, prices: null }, '1k', 'medium', 1)).toBe(estimateRunUsd('1k', 'medium', null))
  })
})
