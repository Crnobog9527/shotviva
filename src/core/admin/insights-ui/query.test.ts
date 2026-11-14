import { describe, expect, it } from 'vitest'

import { insightsHref, parseInsights } from './query'

const NOW = Date.parse('2026-11-14T02:00:00Z')

describe('insights query', () => {
  it('reads every filter from the URL', () => {
    const q = parseInsights('funnel', { from: '2026-10-18', to: '2026-11-14', bucket: 'week', lang: 'zh', source: 'share' }, NOW)
    expect([q.bucket, q.locale, q.source]).toEqual(['week', 'zh', 'share'])
  })

  it('never reads the language from `locale`, which the [locale] route segment swallows', () => {
    expect(parseInsights('funnel', { locale: 'zh' }, NOW).locale).toBe('all')
  })

  it('writes the filters back, defaults left out', () => {
    const q = parseInsights('funnel', { lang: 'zh' }, NOW)
    expect(insightsHref(q)).toBe('/admin/analytics?view=funnel&from=2026-10-18&to=2026-11-14&lang=zh')
  })
})
