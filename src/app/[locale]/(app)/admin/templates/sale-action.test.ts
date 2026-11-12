import { beforeEach, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({ updateTag: vi.fn(), refresh: vi.fn() }))
const rpc = vi.fn()

vi.mock('next/cache', () => cache)
vi.mock('@/core/auth', () => ({ requireAdmin: async () => ({ id: 'admin-1' }), createAdminSupabase: () => ({ rpc }) }))
vi.mock('@/core/admin', () => ({
  runAdminAction: async (work: () => Promise<void>) => {
    try { await work(); return { ok: true } } catch (error) { return { ok: false, error } }
  },
}))
vi.mock('@/core/templates', () => ({ TEMPLATES_CACHE_TAG: 'templates' }))

const { setTemplateSaleAction } = await import('./sale-action')

beforeEach(() => { cache.updateTag.mockReset(); cache.refresh.mockReset(); rpc.mockReset() })

// Signed-in pages read the cached catalogue too (#520): turning sale on or off must show on the
// next load, or a newly sellable template's workspace 404s and a closed one still opens.
it('expires the templates cache after a sale switch', async () => {
  rpc.mockResolvedValue({ error: null })
  await setTemplateSaleAction({ id: 'white-background', enabled: true })
  expect(rpc).toHaveBeenCalledWith('admin_set_template_sale', { p_actor: 'admin-1', p_template_id: 'white-background', p_enabled: true })
  expect(cache.updateTag).toHaveBeenCalledWith('templates')
  expect(cache.refresh).toHaveBeenCalled()
})

it('leaves the cache alone when the database refuses the switch', async () => {
  rpc.mockResolvedValue({ error: { message: 'TEMPLATE_PRICE_BELOW_FLOOR', details: 'below floor' } })
  await setTemplateSaleAction({ id: 'white-background', enabled: true })
  expect(cache.updateTag).not.toHaveBeenCalled()
})
