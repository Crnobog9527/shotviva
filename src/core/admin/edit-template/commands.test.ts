import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import type { ProviderFloors } from '@/core/templates/provider-pricing'

import { saveEditTemplate } from './commands'
import { editLineProblem } from './line-problem'

// Abstract units only: the real floors live in the database and the private docs.
const DEFAULT = '00000000-0000-4000-8000-00000000000d'
const ARK = '00000000-0000-4000-8000-0000000000a1'
const UNSYNCED = '00000000-0000-4000-8000-0000000000b2'
const tiers = (n: number) => ({ '1k': n, '2k': n * 2, '4k': n * 3 })
const floors: ProviderFloors = {
  high: tiers(10), medium: tiers(10), activeProvider: DEFAULT, version: 'v2',
  providers: {
    [DEFAULT]: { high: tiers(10), medium: tiers(10), resolutions: ['1k', '2k', '4k'] },
    // A line without 4K: that field's floor is the placeholder 1.
    [ARK]: { high: tiers(30), medium: { '1k': 30, '2k': 60, '4k': 1 }, resolutions: ['1k', '2k'] },
    [UNSYNCED]: { high: tiers(10), medium: tiers(10), unknownCapabilities: true },
  },
  models: { [DEFAULT]: 'default-model', [ARK]: 'ark-model', [UNSYNCED]: 'other' },
}

function fakeDb(storedProvider: string | null = null) {
  const row = {
    is_active: true, credits_cost: tiers(20), quality: 'medium',
    template_sale_approvals: { enabled: true, unpriced_resolutions: [] },
    template_prompts: { provider_id: storedProvider, body: 'W', version: 2, model_params: {} },
  }
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error: null }) }
  const rpc = vi.fn(async (name: string, args: unknown) => (void name, void args, { error: null as null | { message: string; details: string } }))
  return { db: { from: () => query, rpc } as unknown as SupabaseClient, rpc }
}

const input = (extra: Record<string, unknown>) => ({
  isActive: true, creditsCost: tiers(20), wrapper: 'W',
  params: { classifier: 'c', constraints: { object: '', background: '', style: '', subject: '', global: '', fallback: 'f' } }, ...extra,
})
const sentPrompt = (rpc: ReturnType<typeof fakeDb>['rpc']) => (rpc.mock.calls[0]![1] as { p_prompt: Record<string, unknown> }).p_prompt

describe('editLineProblem', () => {
  it('accepts the default line and a known, synced line; refuses unknown or unsynced ones', () => {
    expect(editLineProblem(floors, null)).toBeNull()
    expect(editLineProblem(floors, ARK)).toBeNull()
    expect(editLineProblem(floors, UNSYNCED)).toMatch(/能力尚未确认/)
    expect(editLineProblem(floors, '00000000-0000-4000-8000-000000000999')).toMatch(/不存在/)
  })
})

describe('saveEditTemplate 「出图模型」', () => {
  it('writes the chosen line and holds the price to that line’s floor', async () => {
    const { db, rpc } = fakeDb()
    await expect(saveEditTemplate(db, 'admin', input({ providerId: ARK }), floors)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(rpc).not.toHaveBeenCalled()

    await saveEditTemplate(db, 'admin', input({ providerId: ARK, creditsCost: { '1k': 30, '2k': 60, '4k': 20 } }), floors)
    expect(sentPrompt(rpc)).toMatchObject({ provider_id: ARK })
  })

  it('sends null for 跟随默认线路 and checks the default line’s floor', async () => {
    const { db, rpc } = fakeDb(ARK)
    await saveEditTemplate(db, 'admin', input({ providerId: null }), floors)
    expect(sentPrompt(rpc)).toMatchObject({ provider_id: null })
  })

  it('an older page that sends no providerId keeps the stored binding and its floor', async () => {
    const { db, rpc } = fakeDb(ARK)
    await expect(saveEditTemplate(db, 'admin', input({}), floors)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await saveEditTemplate(db, 'admin', input({ creditsCost: tiers(30) }), floors)
    expect(sentPrompt(rpc)).not.toHaveProperty('provider_id')
  })

  it('refuses a line whose capabilities are not confirmed', async () => {
    const { db, rpc } = fakeDb()
    await expect(saveEditTemplate(db, 'admin', input({ providerId: UNSYNCED }), floors)).rejects.toThrow(/能力尚未确认/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('passes the database’s reference-range refusal through as an input error', async () => {
    const { db, rpc } = fakeDb()
    rpc.mockResolvedValueOnce({ error: { message: 'MODEL_REFERENCE_LIMIT', details: '模型支持 0–0 张输入图' } })
    await expect(saveEditTemplate(db, 'admin', input({ providerId: ARK, creditsCost: tiers(30) }), floors)).rejects.toThrow('模型支持 0–0 张输入图')
  })
})

// The minimum is max(catalogue tariff, route floor) (Owner 2026-11-23: edit 2K at 15, tariff 1997).
describe('saveEditTemplate 下限', () => {
  const tariff = { edit: { quality: 'medium' as const, costs: { '1k': 15, '2k': 15, '4k': 58 } } }
  const CHEAP = '00000000-0000-4000-8000-0000000000c3'
  const priced: ProviderFloors = {
    ...floors, tariffs: tariff,
    providers: { ...floors.providers, [CHEAP]: { high: tiers(5), medium: tiers(5), resolutions: ['1k', '2k', '4k'] } },
    models: { ...floors.models, [CHEAP]: 'cheap-model' },
  }
  const price = { '1k': 15, '2k': 15, '4k': 58 }

  it('saves 2K at the tariff on a line whose floor is lower', async () => {
    const { db, rpc } = fakeDb()
    await saveEditTemplate(db, 'admin', input({ providerId: CHEAP, creditsCost: price }), priced)
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('names the tier and the number, not a cost floor, when the line’s floor is higher', async () => {
    const { db } = fakeDb()
    // The default line's medium 2K floor is 20.
    await expect(saveEditTemplate(db, 'admin', input({ providerId: DEFAULT, creditsCost: price }), priced)).rejects.toThrow('2K 不能低于 20 积分（填了 15）')
    await expect(saveEditTemplate(db, 'admin', input({ providerId: DEFAULT, creditsCost: price }), priced)).rejects.not.toThrow(/成本保护下限/)
  })
})

describe('saveEditTemplate and approvals', () => {
  it('never lets an approval of the edit price skip a route’s floor (1997)', async () => {
    const { db } = fakeDb()
    const approved = { quality: 'medium' as const, costs: { '1k': 15, '2k': 15, '4k': 58 } }
    const withApproval: ProviderFloors = { ...floors, approvals: { [DEFAULT]: { edit: approved } } }
    await expect(saveEditTemplate(db, 'admin', input({ providerId: DEFAULT, creditsCost: approved.costs }), withApproval)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
