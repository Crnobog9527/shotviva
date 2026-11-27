import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { resolveCollection } = await import('./resolve-collection')

// A catalogue template as the cached catalogue holds it, private-looking fields included, so the
// test proves the collection carries none of them.
const template = (id: string, extra: object = {}) => ({
  id, name: `Name ${id}`, description: null, category: 'food', categoryName: '餐饮', categoryOrder: 1, compare: false,
  creditsCost: { '1k': 43, '2k': 60, '4k': 90 }, copyFields: [{ key: 'dish', label: '菜名', type: 'short', required: false, maxLength: 20, public: false }], toggles: [],
  cover: { type: 'image', before: `https://a/${id}-b.webp`, after: `https://a/${id}-a.webp`, motion: null, poster: null },
  ...extra,
}) as never

const SERIES = '11111111-2222-4333-8444-555555555555'
const entries = [
  { type: 'template', template: template('solo'), path: ['food'] },
  { type: 'template', template: template('menu', { poster: true }), path: ['posters'] },
  { type: 'series', series: { id: SERIES, slug: 'dark', name: '暗调', description: '一组', cover: null, categoryName: '餐饮', members: [template('m1'), template('m2'), template('m3', { poster: true })] }, path: ['food'] },
] as never

describe('a template collection (ARCHITECTURE §5.1g)', () => {
  it('keeps the order the sharer picked, a series member as a template of its own', () => {
    const resolved = resolveCollection(entries, [
      { type: 'template', id: 'm2' }, { type: 'series', id: SERIES }, { type: 'template', id: 'solo' },
    ])
    expect(resolved.map((entry) => (entry.type === 'series' ? `series:${entry.series.id}` : entry.template.id))).toEqual(['m2', `series:${SERIES}`, 'solo'])
  })

  it('opens a series into its live members, posters left out', () => {
    const [entry] = resolveCollection(entries, [{ type: 'series', id: SERIES }])
    expect(entry).toMatchObject({ type: 'series', series: { name: '暗调', description: '一组', members: [{ id: 'm1' }, { id: 'm2' }] } })
  })

  it('drops picks that are no longer live, and poster templates', () => {
    const resolved = resolveCollection(entries, [
      { type: 'template', id: 'gone' }, { type: 'template', id: 'menu' }, { type: 'series', id: '99999999-2222-4333-8444-555555555555' }, { type: 'template', id: 'solo' },
    ])
    expect(resolved).toHaveLength(1)
  })

  it('carries only what a public catalogue card shows: no prices, text fields or toggles', () => {
    const resolved = resolveCollection(entries, [{ type: 'template', id: 'solo' }, { type: 'series', id: SERIES }])
    const [single, series] = resolved as unknown as [{ template: object }, { series: { members: object[] } }]
    const keys = ['category', 'categoryName', 'compare', 'cover', 'description', 'id', 'name']
    expect(Object.keys(single.template).sort()).toEqual(keys)
    for (const member of series.series.members) expect(Object.keys(member).sort()).toEqual(keys)
    expect(JSON.stringify(resolved)).not.toMatch(/creditsCost|copyFields|toggles|prompt|菜名/)
  })
})
