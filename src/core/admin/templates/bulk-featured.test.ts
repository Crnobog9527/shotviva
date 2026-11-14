import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repo = vi.hoisted(() => ({ setFeaturedTemplates: vi.fn() }))
const logger = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }))
vi.mock('./repository', () => repo)
vi.mock('@/core/logger', () => ({ logger }))

const { setTemplatesFeatured } = await import('./bulk-featured')

type Row = { id: string; name: string; is_active: boolean; visible_in: string[]; featured_rank: number | null }
const row = (id: string, rank: number | null, over: Partial<Row> = {}): Row => ({ id, name: `Name ${id}`, is_active: true, visible_in: ['web'], featured_rank: rank, ...over })

// The one read: .from('templates').select(…).or(…) resolves to these rows; the filter is recorded.
function fakeClient(rows: Row[]) {
  const or = vi.fn().mockResolvedValue({ data: rows, error: null })
  const client = { from: () => ({ select: () => ({ or }) }) } as unknown as SupabaseClient
  return { client, or }
}

beforeEach(() => {
  repo.setFeaturedTemplates.mockReset().mockResolvedValue(undefined)
  logger.info.mockReset()
})

describe('setTemplatesFeatured', () => {
  it('writes the whole new list once and logs one line per template it changed', async () => {
    const { client, or } = fakeClient([row('a', 1), row('b', 2), row('c', null), row('d', null)])
    const plan = await setTemplatesFeatured(client, 'admin-1', { ids: ['c', 'a', 'd'], featured: true, expectedIds: ['a', 'b'] })
    expect(or).toHaveBeenCalledWith('featured_rank.not.is.null,id.in.(c,a,d)')
    expect(repo.setFeaturedTemplates).toHaveBeenCalledExactlyOnceWith(client, ['a', 'b', 'c', 'd'])
    expect(plan.unchanged.map((item) => item.id)).toEqual(['a'])
    expect(logger.info.mock.calls).toEqual([
      ['admin.template.featured_changed', { adminId: 'admin-1', templateId: 'c', featured: true }],
      ['admin.template.featured_changed', { adminId: 'admin-1', templateId: 'd', featured: true }],
    ])
  })

  it('refuses a list that changed since the page loaded', async () => {
    const { client } = fakeClient([row('a', 1), row('b', 2), row('c', null)])
    await expect(setTemplatesFeatured(client, 'admin-1', { ids: ['c'], featured: true, expectedIds: ['b', 'a'] })).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repo.setFeaturedTemplates).not.toHaveBeenCalled()
  })

  it('saves nothing when one template cannot go on the home page or the list would pass 12', async () => {
    const { client } = fakeClient([row('a', null), row('b', null, { is_active: false })])
    const plan = await setTemplatesFeatured(client, 'admin-1', { ids: ['a', 'b', 'gone'], featured: true, expectedIds: [] })
    expect(plan.failures.map((item) => [item.id, item.reason])).toEqual([['b', 'not_live'], ['gone', 'not_found']])
    const full = Array.from({ length: 12 }, (_, i) => row(`f${i}`, i + 1))
    const over = await setTemplatesFeatured(fakeClient([...full, row('x', null)]).client, 'admin-1', { ids: ['x'], featured: true, expectedIds: full.map((r) => r.id) })
    expect(over.over).toBe(1)
    expect(repo.setFeaturedTemplates).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('clears the ticked ones and keeps the order of the rest', async () => {
    const { client } = fakeClient([row('a', 1), row('b', 2), row('c', 3)])
    await setTemplatesFeatured(client, 'admin-1', { ids: ['b'], featured: false, expectedIds: ['a', 'b', 'c'] })
    expect(repo.setFeaturedTemplates).toHaveBeenCalledWith(client, ['a', 'c'])
  })

  it('rejects ids that are not template slugs before building the filter', async () => {
    const { client, or } = fakeClient([])
    await expect(setTemplatesFeatured(client, 'admin-1', { ids: ['a),id.not.is.null'], featured: true, expectedIds: [] })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(or).not.toHaveBeenCalled()
  })
})
