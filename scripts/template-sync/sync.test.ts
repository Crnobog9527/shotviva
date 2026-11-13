import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const covers = vi.hoisted(() => ({ copyCovers: vi.fn(), copyStyleRefs: vi.fn() }))
vi.mock('../../src/site/template-pricing', () => ({ readTemplateQuote: async () => ({ floors: {}, receipt: {}, envModel: 'm' }) }))
vi.mock('./covers', async (original) => ({ ...await original<typeof import('./covers')>(), copyCovers: covers.copyCovers }))
vi.mock('./style-refs', () => ({ copyStyleRefs: covers.copyStyleRefs }))

const { syncTemplate } = await import('./sync')

const row = { id: 'demo', fields: { images: { min: 0, max: 1 }, copy: [], aspectRatios: ['1:1'] }, subcategory_key: 'sub', series_slug: 'set' }
const snapshot: { catalog: string; provider: null; template: Record<string, unknown>; prompt: object } = { catalog: 'v1', provider: null, template: row, prompt: { body: 'b', version: 1, model_params: {}, provider_id: null } }

const refs = [{ key: 'style-refs/demo/5a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.webp', width: 64, height: 48, uploadedAt: '2026-11-12T00:00:00.000Z' }]
type Answer = { data?: unknown; error?: { message: string } | null }

// rpc() answers by function name; sync_preview_template answers from `writes` in order.
function side(writes: Answer[] = [], styleRefs: Answer = { data: refs, error: null }) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    void args
    if (name === 'read_template_sync_target') return { data: { token: 'missing', version: null }, error: null }
    if (name === 'read_template_sync_source') return { data: snapshot, error: null }
    if (name === 'read_template_sync_style_refs') return styleRefs
    if (name === 'read_template_sync_profiles') return { data: { active: 'openai', inactive: [] }, error: null }
    return writes.shift() ?? { data: 1, error: null }
  })
  return { db: { rpc } as unknown as SupabaseClient, assets: { base: 'https://a.test', store: {} as never }, private: {} as never, rpc }
}
const writesOf = (one: ReturnType<typeof side>) => one.rpc.mock.calls.filter(([name]) => name === 'sync_preview_template')

beforeEach(() => {
  covers.copyCovers.mockReset().mockResolvedValue({})
  covers.copyStyleRefs.mockReset().mockResolvedValue(1)
})

describe('syncTemplate with image slots (§5.1e)', () => {
  const slotted = { images: { min: 1, max: 2, slots: [{ key: 'logo', label: 'Venue logo' }, { key: 'prize_1', label: '1st prize photo', required: true }] }, copy: [], aspectRatios: ['1:1'] }
  const withRow = async (patch: object, run: () => Promise<void>) => {
    const saved = { ...snapshot.template }
    Object.assign(snapshot.template, patch)
    try { await run() } finally { snapshot.template = saved }
  }

  it('carries the slot definitions to the destination unchanged', () => withRow({ fields: slotted, visible_in: ['web'] }, async () => {
    const target = side()
    await syncTemplate('demo', '1', side(), target)
    expect(writesOf(target).at(-1)?.[1]?.p_template).toMatchObject({ fields: slotted })
  }))

  it('refuses a partner-visible slot template', () => withRow({ fields: slotted, visible_in: ['web', 'partner'] }, async () => {
    await expect(syncTemplate('demo', '1', side(), side())).rejects.toMatchObject({ message: 'INVALID_FIELDS_OR_TOGGLES' })
  }))
})

describe('syncTemplate', () => {
  it('a dry run stops after the rolled-back check: one validate-only write, no covers', async () => {
    const preview = side([{ data: 3 }])
    expect(await syncTemplate('demo', '1', preview, preview, true)).toBe(3)
    const writes = preview.rpc.mock.calls.filter(([name]) => name === 'sync_preview_template')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.[1]).toMatchObject({ p_validate_only: true, p_template: { subcategory_key: 'sub', series_slug: 'set' } })
    expect(covers.copyCovers).not.toHaveBeenCalled()
    expect(covers.copyStyleRefs).not.toHaveBeenCalled()
  })

  it.each(['SUBCATEGORY_MISSING', 'SERIES_MISSING'])('reports %s as such, before any cover is copied', async (reason) => {
    const target = side([{ error: { message: reason } }])
    await expect(syncTemplate('demo', '1', side(), target)).rejects.toMatchObject({ message: reason })
    expect(covers.copyCovers).not.toHaveBeenCalled()
  })

  it('sends the source references of the version read, copies them after the check and before the final write', async () => {
    const source = side()
    const target = side()
    covers.copyStyleRefs.mockImplementation(async () => {
      expect(writesOf(target)).toHaveLength(1)
      return 1
    })
    await syncTemplate('demo', '1', source, target)
    expect(source.rpc).toHaveBeenCalledWith('read_template_sync_style_refs', { p_id: 'demo', p_version: 1 })
    expect(covers.copyStyleRefs).toHaveBeenCalledWith('demo', refs, source.private, target.private)
    expect(writesOf(target).map(([, args]) => args)).toEqual([
      expect.objectContaining({ p_validate_only: true, p_prompt: expect.objectContaining({ style_refs: refs }) }),
      expect.objectContaining({ p_validate_only: false, p_prompt: expect.objectContaining({ style_refs: refs }) }),
    ])
  })

  it('an empty list clears production and copies nothing', async () => {
    const target = side()
    await syncTemplate('demo', '1', side([], { data: [], error: null }), target)
    expect(covers.copyStyleRefs).not.toHaveBeenCalled()
    expect(writesOf(target).at(-1)?.[1]).toMatchObject({ p_validate_only: false, p_prompt: { style_refs: [] } })
  })

  it.each([
    ['SOURCE_CHANGED', { error: { message: 'SOURCE_CHANGED' } }],
    ['SOURCE_READ_FAILED', { error: { message: 'permission denied' } }],
    ['INVALID_STYLE_REFS', { data: [{ key: 'style-refs/other/x.webp' }], error: null }],
  ])('stops with %s before anything is written', async (reason, answer) => {
    const target = side()
    await expect(syncTemplate('demo', '1', side([], answer as Answer), target)).rejects.toMatchObject({ message: reason })
    expect(writesOf(target)).toHaveLength(0)
  })

  it('without a private bucket, a template with references fails before any cover is copied', async () => {
    const target = { ...side(), private: undefined }
    await expect(syncTemplate('demo', '1', side(), target)).rejects.toMatchObject({ message: 'STYLE_REF_STORE_MISSING' })
    expect(target.rpc.mock.calls.filter(([name]) => name === 'sync_preview_template')).toHaveLength(1)
    expect(covers.copyCovers).not.toHaveBeenCalled()
  })

  it('a failed object copy is STYLE_REF_COPY_FAILED and the final write never runs', async () => {
    const target = side()
    covers.copyStyleRefs.mockRejectedValue(new Error('network'))
    await expect(syncTemplate('demo', '1', side(), target)).rejects.toMatchObject({ message: 'STYLE_REF_COPY_FAILED' })
    expect(writesOf(target)).toHaveLength(1)
  })
})

describe('syncTemplate with provider profiles (1393)', () => {
  it('sends which profile is live and the other one, and copies the other one’s references too', async () => {
    const other = { key: 'style-refs/demo/6b2d3c4e-5f60-4b7c-9d8e-0f1a2b3c4d5e.webp', width: 32, height: 32, uploadedAt: '2026-11-13T00:00:00.000Z' }
    const entry = { profile: 'seedream', body: 's', model_params: {}, style_refs: [other], provider: { adapter: 'ark_images', model: 'm', base_url: 'u' },
      provider_missing: false, quality: 'medium', credits_cost: { '1k': 1, '2k': 1, '3k': 1 }, unpriced_resolutions: ['3k'] }
    const source = side()
    source.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_template_sync_source') return { data: snapshot, error: null }
      if (name === 'read_template_sync_style_refs') return { data: refs, error: null }
      if (name === 'read_template_sync_profiles') return { data: { active: 'openai', inactive: [entry] }, error: null }
      return { data: { token: 'missing', version: null }, error: null }
    })
    const target = side()
    await syncTemplate('demo', '1', source, target)
    const { provider_missing: _, ...sent } = entry
    void _
    expect(writesOf(target).map(([, args]) => args?.p_profiles)).toEqual([{ active: 'openai', inactive: [sent] }, { active: 'openai', inactive: [sent] }])
    expect(covers.copyStyleRefs).toHaveBeenCalledWith('demo', [...refs, other], expect.anything(), expect.anything())
  })

  it('stops when the test site’s inactive model row is gone', async () => {
    const source = side()
    source.rpc.mockImplementation(async (name: string) => {
      if (name === 'read_template_sync_source') return { data: snapshot, error: null }
      if (name === 'read_template_sync_style_refs') return { data: [], error: null }
      if (name === 'read_template_sync_profiles') return { data: { active: 'openai', inactive: [{ profile: 'seedream', body: 's', model_params: {}, style_refs: [],
        provider: null, provider_missing: true, quality: 'medium', credits_cost: {}, unpriced_resolutions: [] }] }, error: null }
      return { data: { token: 'missing', version: null }, error: null }
    })
    await expect(syncTemplate('demo', '1', source, side())).rejects.toMatchObject({ message: 'SOURCE_PROVIDER_MISSING' })
  })
})
