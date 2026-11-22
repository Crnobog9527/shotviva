import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { foodTogglesOrOff } = await import('./food-toggles')

// 1848: 优化摆盘 / 优化器皿 are off unless the Owner saved the switch on.
describe('food_toggles_enabled', () => {
  it('is off with no row, a wrong type or a failed read', async () => {
    expect(await foodTogglesOrOff(async () => undefined)).toBe(false)
    expect(await foodTogglesOrOff(async () => 'true')).toBe(false)
    expect(await foodTogglesOrOff(async () => { throw new Error('down') })).toBe(false)
  })

  it('follows the stored boolean', async () => {
    expect(await foodTogglesOrOff(async () => true)).toBe(true)
    expect(await foodTogglesOrOff(async () => false)).toBe(false)
  })
})
