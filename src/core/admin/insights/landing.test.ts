import { describe, expect, it } from 'vitest'

import { landingKey, sourceKeyOf, TOP_ROWS, touchBreakdown } from './landing'
import type { CohortPerson } from './reads'

const person = (id: string, image = false, paid = false): CohortPerson => ({
  id, signed_at: '2026-11-14T00:00:00Z', locale: 'en', graylum: false, referred: false,
  first_image_at: image ? '2026-11-14T01:00:00Z' : null, first_paid_at: paid ? '2026-11-15T00:00:00Z' : null,
})
const own = (landing: string, extra: Partial<{ refHost: string; utmSource: string; utmMedium: string }> = {}) =>
  ({ landing, refHost: extra.refHost ?? null, utmSource: extra.utmSource ?? null, utmMedium: extra.utmMedium ?? null, utmCampaign: null })

describe('keys', () => {
  it('drops the query from the landing page and prefers utm over the referring site', () => {
    expect(landingKey('/zh/t/ramen?utm_source=x')).toBe('/zh/t/ramen')
    expect(sourceKeyOf('test', 'social', 'google.com')).toBe('utm: test / social')
    expect(sourceKeyOf(null, null, 'www.reddit.com')).toBe('reddit.com')
    expect(sourceKeyOf(null, null, '$direct')).toBe('(direct)')
  })
})

describe('touchBreakdown', () => {
  it('counts each account once: its own row first, then PostHog (inferred), else no record', () => {
    const people = [person('a', true, true), person('b', true), person('c'), person('d')]
    const result = touchBreakdown(
      people,
      { a: own('/zh/t/ramen?utm_source=test', { utmSource: 'test' }), b: own('/zh/t/ramen') },
      { c: { source: 'organic', locale: 'en', shared: false, landing: '/pricing', refHost: 'google.com', utm: '', medium: '' } },
    )
    expect(result.covered).toEqual({ own: 2, posthog: 1, none: 1 })
    expect(result.byLanding[0]).toMatchObject({ key: '/zh/t/ramen', basis: 'own', counts: { signups: 2, imaged: 2, paid: 1 } })
    expect(result.byLanding.find((line) => line.basis === 'posthog')).toMatchObject({ key: '/pricing', counts: { signups: 1 } })
    expect(result.bySource.map((line) => line.key)).toEqual(expect.arrayContaining(['utm: test', '(direct)', 'google.com', '']))
  })

  it('keeps the table short: the smallest groups go into one 「其他」 line', () => {
    const people = Array.from({ length: 30 }, (_, i) => person(`p${i}`))
    const touches = Object.fromEntries(people.map((p, i) => [p.id, own(`/page-${i}`)]))
    const { byLanding } = touchBreakdown(people, touches, null)
    expect(byLanding).toHaveLength(TOP_ROWS)
    expect(byLanding.at(-1)?.counts.signups).toBe(30 - (TOP_ROWS - 1))
  })
})
