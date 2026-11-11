import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repo = vi.hoisted(() => ({ readFeaturedIds: vi.fn(), setFeaturedTemplates: vi.fn() }))
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }))
vi.mock('./repository', () => repo)
vi.mock('@/core/logger', () => ({ logger }))

const { setFeaturedTemplates } = await import('./commands')
const client = {} as SupabaseClient

beforeEach(() => {
  repo.readFeaturedIds.mockReset().mockResolvedValue(['a', 'b'])
  repo.setFeaturedTemplates.mockReset().mockResolvedValue(undefined)
})

describe('setFeaturedTemplates', () => {
  it('writes when the list the page showed is still the saved one', async () => {
    await setFeaturedTemplates(client, 'admin-1', { ids: ['b'], expectedIds: ['a', 'b'] })
    expect(repo.setFeaturedTemplates).toHaveBeenCalledExactlyOnceWith(client, ['b'])
  })

  it('refuses when the saved list changed since (order counts too), and writes nothing', async () => {
    await expect(setFeaturedTemplates(client, 'admin-1', { ids: ['b'], expectedIds: ['b', 'a'] })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repo.setFeaturedTemplates).not.toHaveBeenCalled()
  })

  it('still takes a bare list from an older page, without the check', async () => {
    await setFeaturedTemplates(client, 'admin-1', ['c'])
    expect(repo.readFeaturedIds).not.toHaveBeenCalled()
    expect(repo.setFeaturedTemplates).toHaveBeenCalledWith(client, ['c'])
  })
})
