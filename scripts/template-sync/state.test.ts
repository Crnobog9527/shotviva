import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({ loadPublishCandidates: vi.fn(), readTemplateFloors: vi.fn() }))
vi.mock('../../src/core/admin/templates/repository', () => ({ loadPublishCandidates: deps.loadPublishCandidates }))
vi.mock('../../src/site/template-pricing', () => ({ readTemplateFloors: deps.readTemplateFloors }))

const { syncTemplateDelete, syncTemplateState } = await import('./state')

const candidate = {
  id: 'demo', name: 'Demo', description: 'One line.', visibleIn: ['web'], coverBeforeUrl: 'https://a.test/b.webp',
  coverAfterUrl: 'https://a.test/a.webp', coverLocales: {}, quality: 'medium', creditsCost: { '1k': 5, '2k': 6, '4k': 7 },
  isActive: false, saleEnabled: false, unpricedResolutions: [], hasPrompt: true, providerId: null,
}
const floors = { high: { '1k': 2, '2k': 4, '4k': 6 }, medium: { '1k': 1, '2k': 2, '4k': 3 } }

function target(answer: { data?: unknown; error?: { message: string } }) {
  const rpc = vi.fn(async () => answer)
  return { db: { rpc } as unknown as SupabaseClient, assets: { base: 'https://a.test', store: {} as never }, rpc }
}
const actor = { id: '00000000-0000-4000-8000-000000000001', runId: '42' }

beforeEach(() => {
  deps.loadPublishCandidates.mockReset().mockResolvedValue([candidate])
  deps.readTemplateFloors.mockReset().mockResolvedValue(floors)
})

describe('syncTemplateState', () => {
  it('publishes through the RPC with the run and the actor, judged as if the sale were open', async () => {
    const side = target({ data: { sale: 'opened', active: 'published' } })
    expect(await syncTemplateState('demo', { active: true, sale: true }, actor, side, false)).toBe('sale opened, published')
    expect(side.rpc).toHaveBeenCalledWith('sync_preview_template_state', expect.objectContaining({
      p_actor: actor.id, p_id: 'demo', p_sale: true, p_active: true, p_run_id: '42', p_validate_only: false,
    }))
  })

  it('refuses before any write what the admin switch would refuse', async () => {
    deps.loadPublishCandidates.mockResolvedValue([{ ...candidate, description: ' ', coverAfterUrl: null }])
    const side = target({ data: {} })
    await expect(syncTemplateState('demo', { active: true, sale: true }, actor, side, false)).rejects.toThrow('PUBLISH_BLOCKED no_description,no_cover')
    expect(side.rpc).not.toHaveBeenCalled()
  })

  it('does not pre-check a template going down, and reports a database refusal by name', async () => {
    const down = target({ data: { sale: 'closed', active: 'unpublished' } })
    expect(await syncTemplateState('demo', { active: false, sale: false }, actor, down, true)).toBe('sale closed, unpublished')
    expect(deps.loadPublishCandidates).not.toHaveBeenCalled()
    await expect(syncTemplateState('demo', { active: true, sale: true }, actor, target({ error: { message: 'SALE_ROUTE_NOT_ALLOWED' } }), false))
      .rejects.toThrow('SALE_ROUTE_NOT_ALLOWED')
  })
})

describe('syncTemplateDelete', () => {
  // A production side that has (or lacks) the row and answers the two RPCs in order.
  function side(exists: boolean, answers: { data?: unknown; error?: { message: string } }[]) {
    const rpc = vi.fn(async () => answers.shift() ?? { data: null })
    const maybeSingle = vi.fn(async () => ({ data: exists ? { id: 'demo' } : null, error: null }))
    const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
    return { db: { rpc, from } as unknown as SupabaseClient, assets: { base: 'https://a.test', store: {} as never }, rpc }
  }

  it('unpublishes, then deletes with production\'s own admin function as the sync actor', async () => {
    const prod = side(true, [{ data: { sale: 'unchanged', active: 'unpublished' } }, { data: true }])
    expect(await syncTemplateDelete('demo', false, actor, prod, false)).toBe('sale unchanged, unpublished, deleted')
    expect(prod.rpc).toHaveBeenNthCalledWith(1, 'sync_preview_template_state', expect.objectContaining({ p_id: 'demo', p_active: false }))
    expect(prod.rpc).toHaveBeenNthCalledWith(2, 'admin_delete_template', { p_actor: actor.id, p_id: 'demo' })
  })

  it('does nothing where production never had it, and only rolls back the unpublish on a dry run', async () => {
    const absent = side(false, [])
    expect(await syncTemplateDelete('demo', false, actor, absent, false)).toBe('deleted on the test site, absent here')
    expect(absent.rpc).not.toHaveBeenCalled()
    const dry = side(true, [{ data: { sale: 'unchanged', active: 'unpublished' } }])
    expect(await syncTemplateDelete('demo', false, actor, dry, true)).toBe('sale unchanged, unpublished, would delete')
    expect(dry.rpc).toHaveBeenCalledTimes(1)
  })
})
