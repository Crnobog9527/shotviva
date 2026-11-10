import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { route } = vi.hoisted(() => ({ route: vi.fn() }))
vi.mock('./image-route', () => ({ labImageRoute: route }))
const { quoteLabMatrix, reserveLabMatrix } = await import('./matrix')

describe('prompt lab cost confirmation', () => {
  const p = { sessionId: randomUUID(), batchId: randomUUID(), providerId: randomUUID(), quality: 'medium', resolution: '1k',
    useStyleReference: true, photoIds: [randomUUID(), randomUUID(), randomUUID()], versionIds: [randomUUID(), randomUUID()] }
  const rpc = vi.fn()
  const db = { rpc } as unknown as SupabaseClient
  beforeEach(() => { vi.resetAllMocks(); route.mockResolvedValue({ provider: { id: 'snapshot' }, estimate: 0.065 }) })

  it('re-quotes six cells and rejects a stale or browser-selected lower price before reserving', async () => {
    expect(await quoteLabMatrix(db, p)).toEqual({ count: 6, estimatePerCellUsd: 0.065, estimateUsd: 0.39 })
    await expect(reserveLabMatrix(db, 'actor', { ...p, expectedEstimateUsd: 0.1 })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes all cells in one RPC and carries the shared budget rejection to the caller', async () => {
    rpc.mockResolvedValue({ error: { message: 'TEST_BUDGET_EXCEEDED' } })
    await expect(reserveLabMatrix(db, 'actor', { ...p, expectedEstimateUsd: 0.39 })).rejects.toMatchObject({ code: 'TEST_BUDGET_EXCEEDED' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('admin_begin_prompt_lab_matrix', expect.objectContaining({
      p_photos: p.photoIds, p_versions: p.versionIds, p_estimate_usd: 0.065, p_model: 'snapshot',
    }))
  })
})
