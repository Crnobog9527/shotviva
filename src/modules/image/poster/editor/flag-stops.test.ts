import { describe, expect, it } from 'vitest'

import { posterContentSchema, posterFieldsSchema } from '@/core/poster'

import { flagStops, nextFlag } from './flag-stops'

const name = { en: 'x', zh: 'x' }
const poster = posterFieldsSchema.parse({ kinds: [
  { key: 'prizes', name, blocks: ['header', 'prizes', 'footer'] },
  { key: 'rules', name, blocks: ['header', 'sections', 'table', 'footer'] },
] })
const content = posterContentSchema.parse({ prizes: { rows: [{ rank: 'a', prize: 'b' }] }, sections: [{ title: 't', lines: ['x'] }, { title: 'u', lines: ['y'] }] })

describe('flagStops (去核对)', () => {
  it('lists the parts with yellow lines in the order the tabs show them', () => {
    const stops = flagStops(poster, content, ['sections.1.lines.0', 'prizes.rows.0.prize', 'header.title', 'footer.address'])
    expect(stops.map((stop) => stop.fold)).toEqual(['shared:title', 'shared:footer', 'prizes:prizes', 'rules:section-1'])
  })

  it('has none without yellow lines', () => {
    expect(flagStops(poster, content, [])).toEqual([])
  })
})

describe('nextFlag', () => {
  const stops = [{ group: 'shared', fold: 'shared:title' }, { group: 'prizes', fold: 'prizes:prizes' }]

  it('starts at the first, walks the fields of a part, then the next part, round to the first', () => {
    expect(nextFlag(stops, null, null)).toEqual({ ...stops[0], field: 0 })
    expect(nextFlag(stops, { fold: 'shared:title', field: 0 }, 2)).toEqual({ ...stops[0], field: 1 })
    expect(nextFlag(stops, { fold: 'shared:title', field: 1 }, 2)).toEqual({ ...stops[1], field: 0 })
    expect(nextFlag(stops, { fold: 'prizes:prizes', field: 0 }, 1)).toEqual({ ...stops[0], field: 0 })
  })

  it('goes back to a part that is off screen, and starts over when its lines were fixed', () => {
    expect(nextFlag(stops, { fold: 'prizes:prizes', field: 0 }, null)).toEqual({ ...stops[1], field: 0 })
    expect(nextFlag(stops, { fold: 'gone', field: 3 }, 1)).toEqual({ ...stops[0], field: 0 })
    expect(nextFlag([], null, null)).toBeNull()
  })
})
