import { describe, expect, it } from 'vitest'

import { funnelBreakdown, funnelSeries, groupOfKey, localeOfPerson, sourceOfPerson, type FunnelInput } from './funnel'
import { parsePeriod } from './period'
import type { CohortPerson } from './reads'

const NOW = Date.parse('2026-11-14T02:00:00Z')
const period = parsePeriod('2026-11-12', '2026-11-14', NOW)

const person = (id: string, signed: string, extra: Partial<CohortPerson> = {}): CohortPerson => ({
  id, signed_at: signed, locale: null, graylum: false, referred: false, first_image_at: null, first_paid_at: null, ...extra,
})

const a = person('a', '2026-11-12T01:00:00Z', { locale: 'zh', first_image_at: '2026-11-12T02:00:00Z', first_paid_at: '2026-11-13T00:00:00Z' })
const b = person('b', '2026-11-12T03:00:00Z', { first_image_at: '2026-11-14T00:00:00Z' })
const c = person('c', '2026-11-13T05:00:00Z', { graylum: true, locale: 'en' })
const d = person('d', '2026-11-13T06:00:00Z', { referred: true })
const e = person('e', '2026-11-14T01:00:00Z')

const touches = {
  a: { source: 'search:google', locale: 'zh' as const, shared: false },
  b: { source: 'ai:chatgpt', locale: 'en' as const, shared: true },
  d: { source: 'ads:google', locale: 'zh' as const, shared: false },
}
const visitors = [
  { bucket: '2026-11-12', locale: 'zh', source: 'search:google', visitors: 4 },
  { bucket: '2026-11-12', locale: 'en', source: 'share', visitors: 2 },
  { bucket: '2026-11-13', locale: 'en', source: 'ads:google', visitors: 3 },
  { bucket: 'all', locale: 'zh', source: 'search:google', visitors: 4 },
  { bucket: 'all', locale: 'en', source: 'share', visitors: 2 },
  { bucket: 'all', locale: 'en', source: 'ads:google', visitors: 3 },
]
const input: FunnelInput = { period, bucket: 'day', people: [a, b, c, d, e], touches, visitors, asOf: NOW }
const all = { locale: 'all', source: 'all' } as const

describe('funnel attribution', () => {
  it('lets the database win, then the share link, then the first page view', () => {
    expect([a, b, c, d, e].map((p) => sourceOfPerson(p, touches))).toEqual(['organic', 'share', 'graylum', 'affiliate', 'unknown'])
    expect(groupOfKey('ads:meta')).toBe('ads')
    expect(groupOfKey('direct')).toBe('organic')
  })

  it('takes the sign-up language first, then the first page view', () => {
    expect([a, b, c, d, e].map((p) => localeOfPerson(p, touches))).toEqual(['zh', 'en', 'en', 'zh', 'unknown'])
  })
})

describe('funnel series', () => {
  it('counts each bucket and the whole period', () => {
    const { rows, total } = funnelSeries(input, all)
    expect(rows.map((r) => [r.bucket, r.counts.signups, r.counts.visitors])).toEqual([
      ['2026-11-12', 2, 6], ['2026-11-13', 2, 3], ['2026-11-14', 1, 0],
    ])
    expect(total).toEqual({ visitors: 9, signups: 5, imaged: 2, imaged24h: 1, paid: 1 })
  })

  it('filters people and visitors alike', () => {
    expect(funnelSeries(input, { locale: 'zh', source: 'all' }).total).toMatchObject({ visitors: 4, signups: 2 })
    expect(funnelSeries(input, { locale: 'all', source: 'ads' }).total).toMatchObject({ visitors: 3, signups: 0 })
  })

  it('has no visitor number for Graylum or unattributed people, or without PostHog', () => {
    expect(funnelSeries(input, { locale: 'all', source: 'graylum' }).total).toMatchObject({ visitors: null, signups: 1 })
    expect(funnelSeries({ ...input, visitors: null, touches: null }, all).total.visitors).toBeNull()
  })

  it('marks buckets with sign-ups under 7 days old as still maturing', () => {
    const { rows, maturing } = funnelSeries(input, all)
    expect(rows.every((r) => r.maturing)).toBe(true)
    expect(maturing).toBe(true)
    const old = parsePeriod('2026-10-01', '2026-10-31', NOW)
    expect(funnelSeries({ ...input, period: old }, all).rows.some((r) => r.maturing)).toBe(false)
    expect(funnelSeries({ ...input, period: parsePeriod('2026-11-01', '2026-11-14', NOW) }, all).rows.map((r) => r.maturing).indexOf(true)).toBe(6)
  })

  it('gives an empty period zeros, not an error', () => {
    const { rows, total } = funnelSeries({ ...input, people: [], visitors: [] }, all)
    expect(rows).toHaveLength(3)
    expect(total).toEqual({ visitors: 0, signups: 0, imaged: 0, imaged24h: 0, paid: 0 })
  })

  it('splits the period by source and by language', () => {
    const { bySource, byLocale } = funnelBreakdown(input, all)
    expect(bySource.map((r) => r.counts.signups)).toEqual([1, 1, 1, 0, 1, 1])
    expect(byLocale.map((r) => r.counts.signups)).toEqual([2, 2])
  })
})
