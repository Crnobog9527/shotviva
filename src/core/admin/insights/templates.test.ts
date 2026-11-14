import { describe, expect, it } from 'vitest'

import type { TemplateStat } from './reads'
import { cheapestCreditUsd, parseRedrawAlert, redrawCounted, sortLines, templateLines } from './templates'

const stat = (id: string, extra: Partial<TemplateStat> = {}): TemplateStat => ({
  template_id: id, name: id, name_zh: null, category_key: 'food', category_name: '餐饮', subcategory_key: null,
  series_id: null, series_name: null, live: true, uses: 0, users: 0, succeeded: 0, failed: 0, redraws: 0, costed: 0,
  cost_usd: 0, paid_cost_usd: 0, free_cost_usd: 0, credits: 0, paid_credits: 0, errors: [], uses_14d: 0,
  favourites: 0, favourites_added: 0, ...extra,
})

const SERIES = '11111111-1111-4111-8111-111111111111'
const stats = [
  stat('a', { series_id: SERIES, series_name: '系列', uses: 10, users: 4, succeeded: 8, failed: 2, redraws: 4, costed: 10, cost_usd: 20, paid_cost_usd: 20, credits: 80, paid_credits: 80, uses_14d: 10, errors: [{ code: 'PROVIDER_FAILED', count: 2 }] }),
  stat('b', { series_id: SERIES, series_name: '系列', uses: 5, users: 2, succeeded: 5, redraws: 1, costed: 5, cost_usd: 10, free_cost_usd: 10, credits: 40, uses_14d: 5, favourites: 3 }),
  stat('c', { category_key: 'pets', category_name: '宠物' }),
  stat('d', { live: false }),
]
// Abstract units only (one credit = 1): no real price, cost or credit rate in tests.
const input = { stats, shares: { a: { shares: 2, opens: 7 } }, creditUsd: 1, redrawAlert: 0.3, redrawCounted: true }

describe('template lines', () => {
  it('works out rates and a run-time margin per template', () => {
    const [a] = templateLines(input, 'template')
    expect(a).toMatchObject({ successRate: 0.8, redrawRate: 0.5, costPerImage: 2.5, creditsPerImage: 10, shares: 2, shareOpens: 7 })
    expect(a!.margin).toBeCloseTo(0.75)
    expect(a!.flags).toEqual({ idle: false, redraw: true, failing: true })
  })

  it('flags live templates nobody used in 14 days, not offline ones', () => {
    const lines = templateLines(input, 'template')
    expect(lines.find((l) => l.key === 'c')!.flags.idle).toBe(true)
    expect(lines.find((l) => l.key === 'd')!.flags.idle).toBe(false)
  })

  it('has no margin without paid credits or a credit price', () => {
    const lines = templateLines({ ...input, creditUsd: null }, 'template')
    expect(lines.map((l) => l.margin)).toEqual([null, null, null, null])
  })

  it('sums templates into series and categories', () => {
    const series = templateLines(input, 'series').find((l) => l.key === SERIES)!
    expect(series).toMatchObject({ members: 2, uses: 15, succeeded: 13, redraws: 5, favourites: 3 })
    expect(templateLines(input, 'category').map((l) => [l.label, l.members])).toEqual([['餐饮', 3], ['宠物', 1]])
  })

  it('sorts highest first, worst success first, empty values last', () => {
    const lines = templateLines(input, 'template')
    expect(sortLines(lines, 'uses').map((l) => l.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortLines(lines, 'success').map((l) => l.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortLines(lines, 'favourites')[0]!.key).toBe('b')
  })
})

describe('redraws before they were recorded', () => {
  it('count from the Beijing day of the first Make again', () => {
    // 2026-11-14 23:30 UTC is 2026-11-15 in Beijing.
    expect(redrawCounted('2026-11-14T23:30:00Z', '2026-11-15')).toBe(true)
    expect(redrawCounted('2026-11-14T23:30:00Z', '2026-11-14')).toBe(false)
    expect(redrawCounted(null, '2026-11-20')).toBe(false)
    expect(redrawCounted(undefined, '2026-11-20')).toBe(false)
  })

  it('show no rate and raise no redraw flag for an earlier period', () => {
    const [a] = templateLines({ ...input, redrawCounted: false }, 'template')
    expect([a!.redrawRate, a!.flags.redraw, a!.redraws]).toEqual([null, false, 4])
  })
})

describe('template inputs', () => {
  it('reads the redraw alert as a whole percentage', () => {
    expect([parseRedrawAlert('25'), parseRedrawAlert('0'), parseRedrawAlert('x')]).toEqual([0.25, 0.3, 0.3])
  })

  it('takes the lowest price per credit', () => {
    expect(cheapestCreditUsd([{ priceUsd: 2, credits: 1 }, { priceUsd: 3, credits: 3 }])).toBe(1)
    expect(cheapestCreditUsd([])).toBeNull()
  })
})
