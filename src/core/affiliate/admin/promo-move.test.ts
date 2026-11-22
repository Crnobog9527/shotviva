import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { movePreview, movePromo } from './promo-move'
import { MOVE_COPY as M } from './promo-move-copy'

vi.mock('server-only', () => ({}))
vi.mock('@/core/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const ORG = '0b6f0a6e-2b1e-4c55-9a3e-0f1f3d6c9a11'
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const dbAnswering = (answer: { data: unknown; error: { message: string; code?: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(answer)
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}

// The one-off move of this month's old promotion grants into the org's promo pool (migration 1895).
describe('movePromo', () => {
  it('sends the amount the page showed and reports the move', async () => {
    const { db, rpc } = dbAnswering({ data: { applied: true, credits: 7500 }, error: null })
    expect(await movePromo(db, 'admin', form({ operation: 'promoMove', org_id: ORG, credits: '7500' }))).toBe(M.answers.applied)
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_move', { p_actor: 'admin', p_input: { org_id: ORG, credits: 7500 } })
  })

  it('tells a second click, a changed amount and a suspended org apart', async () => {
    expect(await movePromo(dbAnswering({ data: { applied: false, reason: 'nothing', credits: 0 }, error: null }).db, 'a', form({ org_id: ORG, credits: '7500' }))).toBe(M.answers.nothing)
    expect(await movePromo(dbAnswering({ data: { applied: false, reason: 'changed', credits: 7000 }, error: null }).db, 'a', form({ org_id: ORG, credits: '7500' }))).toBe(M.answers.changed)
    expect(await movePromo(dbAnswering({ data: null, error: { message: 'PROMO_PARTNER_OFF' } }).db, 'a', form({ org_id: ORG, credits: '1' }))).toBe(M.answers.partnerOff)
  })

  it('checks the form before calling the database, and throws on an unexpected error', async () => {
    const { db, rpc } = dbAnswering({ data: null, error: null })
    for (const credits of ['-1', '1.5', '', 'x']) expect(await movePromo(db, 'a', form({ org_id: ORG, credits }))).toBe(M.answers.invalid)
    expect(await movePromo(db, 'a', form({ org_id: 'nope', credits: '1' }))).toBe(M.answers.invalid)
    expect(rpc).not.toHaveBeenCalled()
    await expect(movePromo(dbAnswering({ data: null, error: { message: 'boom' } }).db, 'a', form({ org_id: ORG, credits: '1' }))).rejects.toThrow()
  })
})

describe('movePreview', () => {
  it('reads the preview as the admin, and hides the block when it cannot be read', async () => {
    const { db, rpc } = dbAnswering({ data: { period: '2026-11', recipient: ORG, credits: 7500, moved: 0 }, error: null })
    expect(await movePreview(db, 'admin', ORG)).toEqual({ period: '2026-11', credits: 7500, moved: 0 })
    expect(rpc).toHaveBeenCalledWith('admin_partner_promo_move_preview', { p_actor: 'admin', p_org: ORG })
    expect(await movePreview(dbAnswering({ data: null, error: { message: 'NOT_ADMIN', code: 'P0001' } }).db, 'a', ORG)).toBeNull()
  })
})
