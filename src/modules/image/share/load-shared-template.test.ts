import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('../catalogue/load-catalogue-view', () => ({ loadCatalogueView: vi.fn() }))

const { findShared } = await import('./load-shared-template')

const template = (id: string) => ({
  id, name: id, description: null, category: 'food', categoryName: '餐饮', categoryOrder: 1, compare: false,
  creditsCost: { '1k': 43, '2k': 60, '4k': 90 }, copyFields: [{ key: 'dish', label: '菜名', type: 'short', required: false, maxLength: 20, public: false }], toggles: [],
  cover: { type: 'image', before: 'https://a/b.webp', after: 'https://a/a.webp', motion: null, poster: null },
}) as never

describe('share page template (Owner 2026-11-13)', () => {
  const entries = [
    { type: 'template', template: template('solo'), path: ['food'] },
    { type: 'series', series: { id: 's', slug: 'dark', name: '暗调', description: null, cover: null, categoryName: '餐饮', members: [template('m1'), template('m2')] }, path: ['food'] },
  ] as never

  it('finds a single template or a series member, with the series', () => {
    expect(findShared(entries, 'solo')).toMatchObject({ id: 'solo', series: null })
    expect(findShared(entries, 'm2')).toMatchObject({ id: 'm2', series: { name: '暗调', members: [{ id: 'm1' }, { id: 'm2' }] } })
  })

  it('carries nothing beyond what the catalogue card shows', () => {
    const shown = findShared(entries, 'm1') as unknown as Record<string, unknown>
    expect(Object.keys(shown).sort()).toEqual(['category', 'categoryName', 'compare', 'cover', 'description', 'id', 'name', 'series'])
    expect(JSON.stringify(shown)).not.toMatch(/creditsCost|copyFields|toggles/)
  })

  // Unpublished and soft-deleted templates (#591 keeps a deleted one unpublished) are not in the
  // cached web catalogue at all, so they read as not live.
  it('is null for a template that is not live', () => {
    expect(findShared(entries, 'gone')).toBeNull()
  })

  it('is null for a dense-text poster template', () => {
    const poster = { ...(template('menu-poster') as object), poster: true } as never
    expect(findShared([{ type: 'template', template: poster, path: ['posters'] }] as never, 'menu-poster')).toBeNull()
  })
})
