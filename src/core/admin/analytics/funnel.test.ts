import { describe, expect, it } from 'vitest'

import { funnelQuery, loadFunnel, MAX_SEGMENTS, parseFunnelDim } from './funnel'
import { fakeRun, WEEK } from './test-samples'

describe('转化漏斗 query', () => {
  it('walks the six steps in order, each at or after the step before', () => {
    const { query } = funnelQuery(WEEK, 'none')
    for (const event of ['$pageview', 'upload', 'generate', 'paywall_view', 'checkout_start', 'purchase']) expect(query).toContain(`'${event}'`)
    expect(query).toContain("properties.status = 'succeeded'")
    expect(query).toContain('countIf(h0 AND h1 AND t1 >= t0 AND h2 AND t2 >= t1) AS s2')
    expect(query).toContain('GROUP BY person_id, in_current')
  })

  it('splits by the first page view’s property, or by first-seen for new / returning', () => {
    expect(funnelQuery(WEEK, 'device').query).toContain('properties.$device_type')
    expect(funnelQuery(WEEK, 'locale').query).toContain('properties.locale')
    expect(funnelQuery(WEEK, 'country').query).toContain('properties.$geoip_country_code')
    expect(funnelQuery(WEEK, 'source').query).toContain("'$direct'")
    const visitor = funnelQuery(WEEK, 'visitor').query
    expect(visitor).toContain('LEFT JOIN')
    expect(visitor).toContain("'returning', 'new'")
    expect(funnelQuery(WEEK, 'none').query).not.toContain('JOIN')
  })

  // Control review of #280: the outer `seg` / `cur` aliases must not share a name with a column
  // of the inner query, or HogQL may refuse it or group by the inner value instead of new/returning.
  it.each(['none', 'locale', 'device', 'source', 'country', 'visitor'] as const)('keeps outer and inner names apart (%s)', (dim) => {
    const { query } = funnelQuery(WEEK, dim)
    const inner = query.slice(query.indexOf('FROM ('), query.indexOf(') AS p'))
    expect(inner).not.toMatch(/\bAS (seg|cur)\b/)
    expect(query.match(/\bAS seg\b/g)).toHaveLength(1)
    expect(query.match(/\bAS cur\b/g)).toHaveLength(1)
    expect(query).toContain('GROUP BY person_id, in_current')
  })

  it('labels new / returning from first-seen against the start of each period', () => {
    const { query } = funnelQuery(WEEK, 'visitor')
    const back = (time: string) => new Date(Date.parse(time) - 90 * 86_400_000).toISOString()
    expect(query).toContain(`countIf(timestamp >= toDateTime('${back(WEEK.start)}')) AS prior_current`)
    expect(query).toContain(`countIf(timestamp < toDateTime('${WEEK.prevStart}')) AS prior_previous`)
    expect(query).toContain(`timestamp >= toDateTime('${back(WEEK.prevStart)}') AND timestamp < toDateTime('${WEEK.start}')`)
    expect(query).toContain("if(if(p.in_current, f.prior_current, f.prior_previous) > 0, 'returning', 'new') AS seg")
    expect(query).toContain('ON f.person_id = p.person_id')
  })

  it('only takes the six dimensions', () => {
    expect(parseFunnelDim('device')).toBe('device')
    expect(parseFunnelDim('browser')).toBe('none')
  })
})

describe('loadFunnel (recorded answers)', () => {
  it('sums the segments into the period totals and keeps the previous period apart', async () => {
    const funnel = await loadFunnel(fakeRun(), WEEK, 'device')
    expect(funnel.current).toEqual([2240, 568, 436, 202, 63, 25])
    expect(funnel.previous).toEqual([2020, 480, 370, 170, 50, 18])
    expect(funnel.segments.map((s) => s.value)).toEqual(['Mobile', 'Desktop', 'Tablet'])
  })

  it('splits new and returning visitors, each period apart (sample answer)', async () => {
    const funnel = await loadFunnel(fakeRun(), WEEK, 'visitor')
    expect(funnel.segments).toEqual([
      { value: 'new', counts: [1500, 330, 250, 110, 30, 9] },
      { value: 'returning', counts: [700, 240, 190, 95, 35, 17] },
    ])
    expect(funnel.current).toEqual([2200, 570, 440, 205, 65, 26])
    expect(funnel.previous).toEqual([2020, 480, 370, 170, 50, 18])
  })

  it(`shows the ${MAX_SEGMENTS} biggest groups and sums the rest, unknowns included, into 其他`, async () => {
    const funnel = await loadFunnel(fakeRun(), WEEK, 'country')
    expect(funnel.segments.map((s) => s.value)).toEqual(['US', 'CN', 'GB', 'DE', 'CA', 'AU', ''])
    // JP 60, FR 40 and the unknown 30.
    expect(funnel.segments.at(-1)?.counts[0]).toBe(130)
    expect(funnel.current[0]).toBe(2090)
  })
})

it('shares one bounded query across five dimensions and loads visitor history only on demand', async () => {
  const { loadFunnelGroup } = await import('./funnel')
  const segments = {locale: 'en', device: 'Mobile', country: 'GB', source: 'google'}
  const results = Object.entries(segments).map(([dim, seg]) => [1, dim, seg, 4, 3, 2, 1, 1, 0])
  const run = fakeRun({'funnel.breakdowns': {columns: ['cur', 'dim', 'seg','s0','s1','s2','s3','s4','s5'], results}})
  const groups = await loadFunnelGroup(run, WEEK, 'breakdowns')
  expect(run.asked).toHaveLength(1)
  expect(run.asked[0]?.query).not.toContain('prior_current')
  expect(groups.none?.segments).toEqual([])
  for (const [dim, value] of Object.entries(segments)) {
    expect(groups[parseFunnelDim(dim)]?.segments).toEqual([{value, counts: groups.none?.current}])
  }
  expect(await loadFunnelGroup(run, WEEK, 'visitor')).toHaveProperty('visitor')
  expect(run.asked.map((entry) => entry.name)).toEqual(['funnel.breakdowns', 'funnel.visitor'])
  expect(run.asked[1]?.query).toContain('prior_current')
})
