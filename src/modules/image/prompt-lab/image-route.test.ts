import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { row, provider } = vi.hoisted(() => ({ row: vi.fn(), provider: vi.fn() }))
vi.mock('@/core/providers', () => ({ findProvider: row }))
vi.mock('../provider', async original => ({ ...await original<typeof import('../provider')>(), imageProvider: provider }))
const { labImageRoute } = await import('./image-route')

describe('prompt lab model capabilities', () => {
  const id = randomUUID(), db = {} as SupabaseClient
  const selection = { providerId: id, quality: 'medium' as const, resolution: '1k' as const, useStyleReference: true }
  const saved = { id, model: 'fixture', module: 'image', adapter: 'openrouter_images', apiKeyLast4: 'test',
    resolutions: ['1k'], capabilities: { resolutions: ['1k'], aspectRatios: ['1:1'], originalRatio: false,
      minReferences: 1, maxReferences: 2, catalogImageCosts: { '1k': .02 } } }
  beforeEach(() => { vi.resetAllMocks(); row.mockResolvedValue(saved); provider.mockResolvedValue({ id: id + '/fixture' }) })

  it('respects the exact selected route, rejects fallback, and quotes the tier’s catalog price', async () => {
    row.mockResolvedValue({ ...saved, estimatedImageCosts: { '1k': 0.01 } })
    expect(await labImageRoute(db, selection)).toMatchObject({ aspectRatio: '1:1', estimate: .02 })
    provider.mockResolvedValue({ id: id + '/fixture', fallbackReason: 'catalog_changed' })
    await expect(labImageRoute(db, selection)).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
  })

  it('rejects unsupported reference counts and a quality the adapter cannot request', async () => {
    await expect(labImageRoute(db, { ...selection, quality: 'high' })).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    row.mockResolvedValue({ ...saved, capabilities: { ...saved.capabilities, maxReferences: 1 } })
    await expect(labImageRoute(db, selection)).rejects.toMatchObject({ code: 'MODEL_INPUT_UNSUPPORTED' })
    expect(provider).not.toHaveBeenCalled()
  })
})
