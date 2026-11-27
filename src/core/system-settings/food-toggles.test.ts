import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { foodSwitchesOrOff } = await import('./food-toggles')

// 2009: 优化摆盘 and 优化器皿 each have their own switch, off unless the Owner saved it on.
describe('food switches', () => {
  it('are off with no rows, a wrong type or a failed read', async () => {
    const off = { plating: false, tableware: false }
    expect(await foodSwitchesOrOff(async () => ({}))).toEqual(off)
    expect(await foodSwitchesOrOff(async () => ({ food_plating_enabled: 'true', food_tableware_enabled: 1 }))).toEqual(off)
    expect(await foodSwitchesOrOff(async () => { throw new Error('down') })).toEqual(off)
  })

  it('follow each stored boolean on its own', async () => {
    expect(await foodSwitchesOrOff(async () => ({ food_tableware_enabled: true }))).toEqual({ plating: false, tableware: true })
    expect(await foodSwitchesOrOff(async () => ({ food_plating_enabled: true, food_tableware_enabled: false }))).toEqual({ plating: true, tableware: false })
    expect(await foodSwitchesOrOff(async () => ({ food_plating_enabled: true, food_tableware_enabled: true }))).toEqual({ plating: true, tableware: true })
  })

  it('ignores the combined 1848 switch', async () => {
    expect(await foodSwitchesOrOff(async () => ({ food_toggles_enabled: true }))).toEqual({ plating: false, tableware: false })
  })
})
