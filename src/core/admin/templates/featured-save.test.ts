import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repo = vi.hoisted(() => ({ setFeaturedTemplates: vi.fn() }))
vi.mock('./repository', () => repo)
vi.mock('@/core/logger', () => ({ logger: { info: vi.fn() } }))
const { setFeaturedTemplates } = await import('./commands')
const client = {} as SupabaseClient

beforeEach(() => repo.setFeaturedTemplates.mockReset().mockResolvedValue(undefined))

describe('setFeaturedTemplates', () => {
  it('passes the original list to the atomic database save', async () => {
    await setFeaturedTemplates(client, 'admin-1', { ids: ['b'], expectedIds: ['a', 'b'] })
    expect(repo.setFeaturedTemplates).toHaveBeenCalledExactlyOnceWith(client, ['b'], ['a', 'b'])
  })
  it('keeps the legacy entry point', async () => {
    await setFeaturedTemplates(client, 'admin-1', ['c'])
    expect(repo.setFeaturedTemplates).toHaveBeenCalledWith(client, ['c'], undefined)
  })
})
