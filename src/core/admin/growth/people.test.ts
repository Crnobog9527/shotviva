import { describe, expect, it } from 'vitest'

import { WEEK } from '../analytics/test-samples'
import { inIds, peopleQuery, shapePeople } from './people'

const ADMIN = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const OLD = '33333333-3333-4333-8333-333333333333'

describe('growth.people query', () => {
  const { query } = peopleQuery(WEEK, { adminIds: [ADMIN], cohort: { current: [NEW], previous: [OLD] } })

  it('leaves out admins with the anonymous views PostHog merged into them', () => {
    expect(query).toContain(`person_id IN (SELECT person_id FROM events WHERE distinct_id IN ('${ADMIN}')`)
    expect(query).toContain('uniqIf(person_id, is_view AND NOT bot AND NOT internal) AS visitors')
  })

  it('counts crawlers and automation apart from visitors', () => {
    expect(query).toContain('countIf(is_view AND bot) AS bot_views')
    expect(query).toMatch(/googlebot\|bingbot\|gptbot/)
    // An AI agent's browser (our own Claude sessions among them) is not a visitor.
    expect(query).toContain("'headless|bot|crawler|^claude'")
  })

  it('asks each period only about the people who signed up in it', () => {
    expect(query).toContain(`distinct_id IN ('${NEW}'), distinct_id IN ('${OLD}')`)
  })

  it('takes browser events from shotviva.com only, and the server checkout through the user id', () => {
    expect(query).toContain("AND (event = 'checkout_start' OR multiIf(")
    expect(query).toContain("!= 'shotviva.com'")
  })

  it('never puts anything but a uuid into the query', () => {
    expect(inIds('distinct_id', ["x') OR 1=1 --", NEW.toUpperCase()])).toBe(`distinct_id IN ('${NEW}')`)
    expect(inIds('distinct_id', [])).toBe('false')
    expect(peopleQuery(WEEK, { adminIds: [], cohort: { current: [], previous: [] } }).query).toContain('false AS internal')
  })
})

describe('shapePeople', () => {
  it('splits the two periods and fills a missing one with zeros', () => {
    const people = shapePeople([{ cur: true, visitors: 9, bot_views: 3, uploaded: 2, paywall: 1, checkout: 1 }])
    expect(people.current).toEqual({ visitors: 9, botViews: 3, uploaded: 2, paywall: 1, checkout: 1 })
    expect(people.previous).toEqual({ visitors: 0, botViews: 0, uploaded: 0, paywall: 0, checkout: 0 })
  })
})
