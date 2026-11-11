import { describe, expect, it } from 'vitest'

import { WEEK } from '../analytics/test-samples'
import { domains, firstTouchQuery, SEARCH_HOSTS, shapeFirstTouch, shapeVisitors, sourceGroup, TAG, visitorsBySourceQuery } from './sources'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const PROMOTER = 'sv-5ab21218499743d58270'

// The HogQL patterns are plain regular expressions; check them the way ClickHouse would.
const re = (literal: string) => new RegExp(literal.slice(1, -1))

describe('utm_source and ?ref= values (matched whole)', () => {
  it('knows names with or without a domain ending', () => {
    expect(re(TAG.ai).test('chatgpt.com')).toBe(true)
    expect(re(TAG.ai).test('chatgpt')).toBe(true)
    expect(re(TAG.social).test('x')).toBe(true)
    expect(re(TAG.social).test('x.com')).toBe(true)
    expect(re(TAG.social).test('producthunt')).toBe(true)
    expect(re(TAG.search).test('google')).toBe(true)
  })

  it('does not match a longer word that only starts the same', () => {
    expect(re(TAG.social).test('xavier')).toBe(false)
    expect(re(TAG.social).test('fbnewsletter')).toBe(false)
    expect(re(TAG.social).test('igloo')).toBe(false)
    expect(re(TAG.ai).test('claudette')).toBe(false)
    expect(re(TAG.search).test('googleplex-news')).toBe(false)
  })
})

describe('referrer hosts', () => {
  it('counts only listed search hosts, so accounts.google.com is not search', () => {
    expect(re(SEARCH_HOSTS).test('www.google.com')).toBe(true)
    expect(re(SEARCH_HOSTS).test('accounts.google.com')).toBe(false)
  })

  it('matches subdomains of social sites but not lookalikes', () => {
    const social = re(domains(['reddit[.]com', 'x[.]com']))
    expect(social.test('old.reddit.com')).toBe(true)
    expect(social.test('x.com')).toBe(true)
    expect(social.test('notreddit.com')).toBe(false)
  })
})

describe('promoter links', () => {
  it('credits a real promoter slug to 推广员 for visitors', () => {
    const expr = sourceGroup({ promoters: [PROMOTER], creditPromoters: true })
    expect(expr).toMatch(new RegExp(`^multiIf\\(\\s+lower\\(extractURLParameter\\(.*'ref'\\)\\) IN \\('${PROMOTER}'\\), 'affiliate'`))
  })

  it('never credits 推广员 from PostHog for sign-ups and buyers (the database binding decides)', () => {
    const expr = sourceGroup({ promoters: [PROMOTER], creditPromoters: false })
    expect(expr).toMatch(/^multiIf\(\s+false, 'affiliate'/)
  })

  it('treats ?ref=producthunt as a value to classify, not as a promoter', () => {
    const expr = sourceGroup({ promoters: [PROMOTER], creditPromoters: true })
    // The promoter test lists real slugs only; other ?ref= values go through the tag checks.
    expect(expr).not.toContain("'producthunt'")
    expect(expr).toContain(`if(lower(extractURLParameter(coalesce(toString(properties.$current_url), ''), 'ref')) IN ('${PROMOTER}'), '', `)
  })

  it('with no promoters at all, no ?ref= is ever 推广员', () => {
    expect(sourceGroup({ promoters: [], creditPromoters: true })).toMatch(/^multiIf\(\s+false, 'affiliate'/)
  })

  it('never puts anything but a slug into the query', () => {
    expect(sourceGroup({ promoters: ["x') OR 1=1 --"], creditPromoters: true })).not.toContain('OR 1=1')
  })
})

describe('order of the checks', () => {
  const expr = sourceGroup({ promoters: [PROMOTER], creditPromoters: true })

  it('paid clicks (gclid, gbraid, wbraid, msclkid, ttclid) come before utm and the referrer', () => {
    for (const id of ['gclid', 'gbraid', 'wbraid', 'msclkid', 'ttclid']) expect(expr).toContain(`'${id}'`)
    expect(expr.indexOf("'ads'")).toBeLessThan(expr.indexOf('properties.utm_source), \'\')), '))
  })

  it('utm_source beats a ?ref= value, which beats the referrer', () => {
    const utm = expr.indexOf("match(lower(coalesce(toString(properties.utm_source)")
    const ref = expr.indexOf("match(if(lower(extractURLParameter")
    const referrer = expr.indexOf("match(lower(coalesce(toString(properties.$referring_domain)")
    expect(utm).toBeLessThan(ref)
    expect(ref).toBeLessThan(referrer)
  })

  it('knows the AI assistants before Google, so gemini.google.com is AI', () => {
    expect(expr.indexOf('gemini[.]google[.]com')).toBeLessThan(expr.indexOf("'^(www[.])?(google"))
  })

  it('treats sign-in, checkout and our own pages as coming back, not as a source', () => {
    expect(expr).toMatch(/shotviva\[\.\]com\|accounts\[\.\]google\[\.\]com\|appleid\[\.\]apple\[\.\]com\|checkout\[\.\]stripe\[\.\]com/)
  })

  it('never uses person properties, which anonymous visitors do not have', () => {
    expect(expr).not.toContain('$initial')
    expect(expr).not.toContain('person.properties')
  })
})

describe('source queries', () => {
  it('groups visitors by their first page view, without admins or automation', () => {
    const { query } = visitorsBySourceQuery(WEEK, [ADMIN], [PROMOTER])
    expect(query).toContain('argMin(multiIf(')
    expect(query).toContain(`IN ('${PROMOTER}'), 'affiliate'`)
    expect(query).toContain(`person_id NOT IN (SELECT person_id FROM events WHERE distinct_id IN ('${ADMIN}')`)
    expect(query).toContain('NOT ((match(')
  })

  it('looks up first touches for the given users only, 90 days back, never as 推广员', () => {
    const { query } = firstTouchQuery(WEEK, [USER], [PROMOTER])
    expect(query).toContain(`distinct_id IN ('${USER}')`)
    expect(query).toContain("toDateTime('2026-08-02T16:00:00.000Z')")
    expect(query).toContain('ARRAY JOIN users AS user_id')
    expect(query).toMatch(/argMinIf\(multiIf\(\s+false, 'affiliate'/)
    expect(query).toContain('LIMIT 10000')
  })
})

describe('shaping', () => {
  it('fills every group and folds unknown labels into 其他', () => {
    expect(shapeVisitors([{ grp: 'search', visitors: 3 }, { grp: 'other', visitors: 1 }])).toEqual({
      search: 3, ai: 0, social: 0, affiliate: 0, ads: 0, direct: 0, other: 1,
    })
  })

  it('leaves out people with no public page view', () => {
    expect(shapeFirstTouch([{ user_id: USER, grp: 'direct' }, { user_id: ADMIN, grp: '' }])).toEqual({ [USER]: 'direct' })
  })
})
