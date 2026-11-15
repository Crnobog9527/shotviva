import { describe, expect, it } from 'vitest'

import { looksAlike, sameColourFamily } from './alike'

// Shape lines in the style of the library's (§5.1c「器皿图库」), against the reading's dishware text.
const USER = 'A white oval platter with a plain rim'

describe('a library vessel that looks like the user own (Owner 2026-11-15)', () => {
  it('is alike when colour and outline both match, synonyms included', () => {
    expect(looksAlike('A long narrow oval platter with a wide flat rim and a shallow well, warm ivory glaze', USER)).toBe(true)
    expect(looksAlike('A white oval plate', USER)).toBe(true)
  })

  it('reads hyphenated compounds by their parts', () => {
    expect(looksAlike('A round ivory-white plate', 'A round white plate')).toBe(true)
    expect(looksAlike('An oval-shaped plate in off-white', USER)).toBe(true)
    expect(looksAlike('A fish-shaped dish, white glaze', 'A white boat-shaped dish')).toBe(true)
  })

  it('tells the same colour family apart from the form', () => {
    expect(sameColourFamily('A teardrop platter, satin ivory-white glaze', USER)).toBe(true)
    expect(sameColourFamily('A black boat-shaped tray', USER)).toBe(false)
    expect(sameColourFamily('A white oval plate', 'An oval platter')).toBe(false)
  })

  it('never lets a material stand in for a colour', () => {
    expect(looksAlike('A white round porcelain plate', 'A blue round porcelain plate')).toBe(false)
    expect(looksAlike('A round stone plate', 'A round grey stone plate')).toBe(false)
  })

  it('is not alike when only one of them matches', () => {
    expect(looksAlike('A long leaf-shaped platter, pale celadon satin glaze', 'A pale green oval plate')).toBe(false)
    expect(looksAlike('A streamlined long, low platter shaped like an elongated teardrop, satin ivory-white glaze', USER)).toBe(false)
    expect(looksAlike('A deep round bowl, satin white porcelain', USER)).toBe(false)
    expect(looksAlike('A white oval plate', '')).toBe(false)
  })
})
