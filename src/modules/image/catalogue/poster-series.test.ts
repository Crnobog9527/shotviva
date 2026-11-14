import { describe, expect, it } from 'vitest'

import type { CatalogueTemplate } from './catalogue-template'
import type { CatalogueSeries, GridEntry } from './catalogue-view'
import { posterSeriesOf, posterStart } from './poster-series'

const member = (id: string, poster: boolean) => ({ id, name: id, ...(poster ? { poster: true } : {}) }) as unknown as CatalogueTemplate
const series = (slug: string, members: CatalogueTemplate[]): CatalogueSeries =>
  ({ id: `${slug}-id`, slug, name: slug, description: null, cover: null, categoryName: 'x', members })

const posters = series('tournament-posters', [member('red', true), member('purple', true), member('emerald', true)])
const photos = series('food-dark', [member('a', false), member('b', false)])
const entries = [{ type: 'series', series: posters }, { type: 'series', series: photos }, { type: 'template', template: member('solo', true) }] as unknown as GridEntry[]

// A series of poster templates opens the poster editor, never the photo creation dialog (总控
// 2026-11-14: production users opening 「赛事海报」 from its series card got the photo dialog).
describe('poster series', () => {
  it('opens its first poster; a photo series opens none', () => {
    expect(posterStart(posters)).toBe('red')
    expect(posterStart(photos)).toBeNull()
    expect(posterStart(null)).toBeNull()
  })

  it('offers the other styles of an open poster, only poster members', () => {
    expect(posterSeriesOf(entries, 'purple')?.members.map((item) => item.id)).toEqual(['red', 'purple', 'emerald'])
    const mixed = [{ type: 'series', series: series('mixed', [member('p', true), member('q', false)]) }] as unknown as GridEntry[]
    expect(posterSeriesOf(mixed, 'p')).toBeNull()
    expect(posterSeriesOf(entries, 'solo')).toBeNull()
    expect(posterSeriesOf(entries, null)).toBeNull()
  })
})
