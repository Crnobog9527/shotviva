import { describe, expect, it } from 'vitest'

import { analyticsHref } from './href'
import { delta, duration, hours, ms, pct, pointDelta, rating } from './format'

describe('analytics formatting', () => {
  it('writes times and shares in plain Chinese', () => {
    expect(duration(41.2)).toBe('41 秒')
    expect(duration(128.4)).toBe('2 分 8 秒')
    expect(duration(null)).toBe('—')
    expect(hours(1.5)).toBe('1.5 小时')
    expect(hours(72)).toBe('3.0 天')
    expect(hours(0.2)).toBe('12 分钟')
    expect(ms(320)).toBe('320 毫秒')
    expect(ms(4600)).toBe('4.6 秒')
    expect(pct(0.4271)).toBe('42.7%')
  })

  it('compares with the previous period, as a change for counts and in points for rates', () => {
    expect(delta(120, 100)).toEqual({ text: '+20%', direction: 'up' })
    expect(delta(80, 100)).toEqual({ text: '−20%', direction: 'down' })
    expect(delta(5, 0)).toBeNull()
    expect(pointDelta(0.46, 0.4)).toEqual({ text: '+6.0 个百分点', direction: 'up' })
    expect(pointDelta(null, 0.4)).toBeNull()
  })

  it('rates Web Vitals with the web.dev thresholds', () => {
    expect(rating('lcp', 2100)).toBe('good')
    expect(rating('lcp', 3100)).toBe('fair')
    expect(rating('lcp', 4600)).toBe('poor')
    expect(rating('cls', 0.3)).toBe('poor')
    expect(rating('inp', null)).toBeNull()
  })

  it('keeps range, dimension and sort in the URL, leaving defaults out', () => {
    const query = { range: '7d', dim: 'none', sort: 'views' } as const
    expect(analyticsHref(query)).toBe('/admin/analytics')
    expect(analyticsHref(query, { range: 'today' })).toBe('/admin/analytics?range=today')
    expect(analyticsHref({ ...query, dim: 'device' }, { sort: 'bounce' }, '#pages')).toBe('/admin/analytics?dim=device&sort=bounce#pages')
  })
})
