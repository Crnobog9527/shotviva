import { describe, expect, it } from 'vitest'

import { bounceQuery, landingQuery, loadPages, MAX_SECONDS, pageViewsQuery, parsePageSort, sortPages } from './pages'
import { fakeRun, TODAY, WEEK } from './test-samples'

describe('每页表现 queries', () => {
  it('reads views from $pageview and time / scroll from the $prev_pageview_* properties of the next view or the leave', () => {
    const { query } = pageViewsQuery(WEEK)
    expect(query).toContain("event = '$pageview'")
    expect(query).toContain("event IN ('$pageview', '$pageleave')")
    expect(query).toContain('properties.$prev_pageview_pathname')
    expect(query).toContain(`least(toFloat(properties.$prev_pageview_duration), ${MAX_SECONDS})`)
    expect(query).toContain('properties.$prev_pageview_max_scroll_percentage')
    expect(query).toContain(`toDateTime('${WEEK.start}')`)
    expect(query).toContain(`toDateTime('${WEEK.prevStart}')`)
  })

  it('leaves out the stretch between yesterday-at-this-time and midnight when comparing today', () => {
    const { query } = pageViewsQuery(TODAY)
    expect(query).toContain(`timestamp < toDateTime('${TODAY.prevEnd}')`)
    expect(query).toContain(`timestamp >= toDateTime('${TODAY.start}')`)
  })

  it('takes bounces from the sessions table and conversions from each person’s first page', () => {
    expect(bounceQuery(WEEK).query).toMatch(/FROM sessions WHERE \$start_timestamp >= /)
    expect(bounceQuery(WEEK).query).toContain('countIf($is_bounce)')
    expect(landingQuery(WEEK).query).toContain("argMinIf(")
    expect(landingQuery(WEEK).query).toContain("event IN ('$pageview', 'signup', 'purchase')")
  })

  it('folds ids in paths into :id so a page is one row', () => {
    expect(pageViewsQuery(WEEK).query).toContain("':id'")
  })
})

describe('loadPages (recorded answers)', () => {
  it('joins views, bounces and landings per page and drops pages with no views', async () => {
    const run = fakeRun()
    const rows = await loadPages(run, WEEK)
    expect(run.asked.map((q) => q.name)).toEqual(['pages.views', 'pages.bounce', 'pages.landing'])
    expect(rows.map((row) => row.path)).toEqual(['/', '/zh', '/pricing', '/generate/ramen-studio', '/photos/:id'])
    expect(rows[0]).toEqual({
      path: '/',
      views: 1840,
      viewsPrev: 1602,
      visitors: 1210,
      visitorsPrev: 1033,
      avgSeconds: 41.2,
      avgScroll: 0.58,
      bounceRate: 598 / 1300,
      landed: 1100,
      signupRate: 88 / 1100,
      purchaseRate: 9 / 1100,
    })
    // A count PostHog sends as a string still reads as a number.
    expect(rows[1]?.viewsPrev).toBe(590)
    // A page nobody entered on has no bounce or conversion rate, rather than 0%.
    expect(rows[3]).toMatchObject({ bounceRate: null, signupRate: null, landed: 0 })
    expect(rows[4]).toMatchObject({ avgSeconds: null, avgScroll: null })
  })

  it('sorts by any column, highest first, pages without the number last', async () => {
    const rows = await loadPages(fakeRun(), WEEK)
    expect(sortPages(rows, 'scroll').map((row) => row.path)).toEqual(['/generate/ramen-studio', '/pricing', '/zh', '/', '/photos/:id'])
    expect(sortPages(rows, 'purchase')[0]?.path).toBe('/pricing')
    expect(parsePageSort('bounce')).toBe('bounce')
    expect(parsePageSort('drop table')).toBe('views')
  })
})
