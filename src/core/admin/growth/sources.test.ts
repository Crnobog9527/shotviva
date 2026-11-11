import { describe, expect, it } from 'vitest'

import { WEEK } from '../analytics/test-samples'
import { firstTouchQuery, shapeFirstTouch, shapeVisitors, sourceGroup, visitorsBySourceQuery } from './sources'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

describe('source grouping', () => {
  const expr = sourceGroup()

  it('checks a promoter link first, then a paid click, then utm, then the referrer', () => {
    const order = ["'affiliate'", "'ads'", "'ai'", "'social'", "'search'", "'other'"].map((g) => expr.indexOf(g))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(expr).toContain("extractURLParameter(coalesce(toString(properties.$current_url), ''), 'ref')")
  })

  it('treats sign-in, checkout and our own pages as coming back, not as a source', () => {
    expect(expr).toMatch(/shotviva\[\.\]com\|accounts\[\.\]google\[\.\]com\|appleid\[\.\]apple\[\.\]com\|checkout\[\.\]stripe\[\.\]com/)
  })

  it('counts only listed search hosts, so accounts.google.com is not search', () => {
    expect(expr).toContain("'^(www[.])?(google[.][a-z.]+|bing[.]com")
  })

  it('knows the AI assistants before Google, so gemini.google.com is AI', () => {
    expect(expr.indexOf('gemini[.]google[.]com')).toBeLessThan(expr.indexOf("'^(www[.])?(google"))
  })

  it('never uses person properties, which anonymous visitors do not have', () => {
    expect(expr).not.toContain('$initial')
    expect(expr).not.toContain('person.properties')
  })
})

describe('source queries', () => {
  it('groups visitors by their first page view, without admins or automation', () => {
    const { query } = visitorsBySourceQuery(WEEK, [ADMIN])
    expect(query).toContain('argMin(multiIf(')
    expect(query).toContain(`person_id NOT IN (SELECT person_id FROM events WHERE distinct_id IN ('${ADMIN}')`)
    expect(query).toContain('NOT ((match(')
  })

  it('looks up first touches for the given users only, 90 days back', () => {
    const { query } = firstTouchQuery(WEEK, [USER])
    expect(query).toContain(`distinct_id IN ('${USER}')`)
    expect(query).toContain("toDateTime('2026-08-02T16:00:00.000Z')")
    expect(query).toContain('ARRAY JOIN users AS user_id')
  })
})

describe('shaping', () => {
  it('fills every group and folds unknown labels into 其他', () => {
    expect(shapeVisitors([{ grp: 'search', visitors: 3 }, { grp: 'other', visitors: 1 }])).toEqual({
      search: 3, ai: 0, social: 0, affiliate: 0, ads: 0, direct: 0, other: 1,
    })
  })

  it('leaves out people with no public page view', () => {
    const map = shapeFirstTouch([{ user_id: USER, grp: 'direct' }, { user_id: ADMIN, grp: '' }])
    expect(map).toEqual({ [USER]: 'direct' })
  })
})
