import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { GenerationRequest } from '../generation-request'
import { archiveFilename } from './archive'
import { assertBatchAllowed } from './limits'
import { preflightSchema } from './preflight'
import { signCell, assertBatchProof } from './proof'

vi.mock('../../env', () => ({ serverEnv: () => ({ SUPABASE_SERVICE_ROLE_KEY: 'unit-test' }) }))

describe('batch admission', () => {
  it.each(['starter', 'pro'] as const)('opens Max for %s', tier => {
    expect(() => assertBatchAllowed(tier, 2, 2)).toThrow(expect.objectContaining({ requiredTier: 'max' }))
  })
  it('limits both dimensions', () => {
    expect(() => assertBatchAllowed('max', 30, 5)).not.toThrow()
    expect(() => assertBatchAllowed('max', 31, 1)).toThrow()
    expect(() => assertBatchAllowed('max', 6, 6)).toThrow()
    expect(preflightSchema.safeParse({ cells: Array(31).fill({ input_key: 'x', template_id: 't', photo_name: 'a' }) }).success).toBe(false)
  })
  it('binds permissions, quote and options to the signed selection', () => {
    const req: GenerationRequest = { userId: 'u', source: 'web', templateId: 'a', inputKey: 'photo',
      batchId: 'batch', batchSize: 6, batchTemplates: 2, expectedCredits: 35, toggles: { replate: true } }
    const names = { position: 1, photo_name: 'Photo', template_name: 'Template' }
    const signed = { ...req, batchCell: { ...names, signature: signCell(req, names) } }
    expect(() => assertBatchProof(signed)).not.toThrow()
    for (const changes of [{ userId: 'v' }, { batchId: 'other' }, { templateId: 'b' }, { batchSize: 1 }, { batchTemplates: 1 },
      { expectedCredits: 1 }, { inputKey: 'another' }, { toggles: {} }, { batchCell: { ...signed.batchCell, position: 2 } }]) {
      expect(() => assertBatchProof({ ...signed, ...changes })).toThrow()
    }
  })
  it('verifies a 4K cell signed before the rename (as 3k), and tells the tiers apart', () => {
    const req: GenerationRequest = { userId: 'u', source: 'web', templateId: 'a', inputKey: 'photo', resolution: '4k',
      aspectRatio: '1:1', batchId: 'batch', batchSize: 2, batchTemplates: 1, expectedCredits: 12 }
    const names = { position: 1, photo_name: 'Photo', template_name: 'Template' }
    // The payload the code before the 4K rename signed for the same cell.
    const old = createHmac('sha256', 'unit-test').update('shotviva.batch.cell.v1\0').update(JSON.stringify(['u', 'batch', 2, 1, 1,
      'Photo', 'Template', 'a', 'photo', 12, '3k', '1:1', [], [], [], undefined])).digest('hex')
    expect(signCell(req, names)).toBe(old)
    expect(() => assertBatchProof({ ...req, batchCell: { ...names, signature: old } })).not.toThrow()
    expect(signCell({ ...req, resolution: '2k' }, names)).not.toBe(old)
  })
  it('keeps names in a single ZIP entry and preserves readable Unicode', () => {
    expect(archiveFilename('../../菜品.JPEG', '样板/一', 2)).toBe('_菜品_样板_一_2.png')
  })
})
