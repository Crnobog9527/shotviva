import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const covers = vi.hoisted(() => ({ copyCovers: vi.fn() }))
vi.mock('../../src/site/template-pricing', () => ({ readTemplateQuote: async () => ({ floors: {}, receipt: {}, envModel: 'm' }) }))
vi.mock('./covers', async (original) => ({ ...await original<typeof import('./covers')>(), copyCovers: covers.copyCovers }))

const { syncTemplate } = await import('./sync')

const row = { id: 'demo', fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }, subcategory_key: 'sub', series_slug: 'set' }
const snapshot = { catalog: 'v1', provider: null, template: row, prompt: { body: 'b', version: 1, model_params: {}, provider_id: null } }

// rpc() answers by function name; sync_preview_template answers from `writes` in order.
function side(writes: { data?: number; error?: { message: string } }[] = []) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    void args
    if (name === 'read_template_sync_target') return { data: { token: 'missing', version: null }, error: null }
    if (name === 'read_template_sync_source') return { data: snapshot, error: null }
    return writes.shift() ?? { data: 1, error: null }
  })
  return { db: { rpc } as unknown as SupabaseClient, assets: { base: 'https://a.test', store: {} as never }, rpc }
}

beforeEach(() => covers.copyCovers.mockReset().mockResolvedValue({}))

describe('syncTemplate', () => {
  it('a dry run stops after the rolled-back check: one validate-only write, no covers', async () => {
    const preview = side([{ data: 3 }])
    expect(await syncTemplate('demo', '1', preview, preview, true)).toBe(3)
    const writes = preview.rpc.mock.calls.filter(([name]) => name === 'sync_preview_template')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.[1]).toMatchObject({ p_validate_only: true, p_template: { subcategory_key: 'sub', series_slug: 'set' } })
    expect(covers.copyCovers).not.toHaveBeenCalled()
  })

  it.each(['SUBCATEGORY_MISSING', 'SERIES_MISSING'])('reports %s as such, before any cover is copied', async (reason) => {
    const target = side([{ error: { message: reason } }])
    await expect(syncTemplate('demo', '1', side(), target)).rejects.toMatchObject({ message: reason })
    expect(covers.copyCovers).not.toHaveBeenCalled()
  })
})
