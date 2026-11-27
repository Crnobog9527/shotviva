import { describe, expect, it } from 'vitest'

import { orgDetailTabHref, parseOrgDetailTab } from './detail-tabs'

const org = '11111111-1111-4111-8111-111111111111'

describe('org detail tabs', () => {
  it('reads a known tab and falls back to the overview', () => {
    expect(parseOrgDetailTab({ tab: 'members' })).toBe('members')
    expect(parseOrgDetailTab({ tab: ['credits', 'works'] })).toBe('credits')
    expect(parseOrgDetailTab({ tab: 'nope' })).toBe('overview')
    expect(parseOrgDetailTab({})).toBe('overview')
  })

  it('opens 企业作品 for an old link that only carries works filters', () => {
    expect(parseOrgDetailTab({ status: 'failed' })).toBe('works')
    expect(parseOrgDetailTab({ cursor: 'x' })).toBe('works')
    expect(parseOrgDetailTab({ tab: 'settings', status: 'failed' })).toBe('settings')
  })

  it('links the overview without a query', () => {
    expect(orgDetailTabHref(org, 'overview')).toBe(`/admin/orgs/${org}`)
    expect(orgDetailTabHref(org, 'promo')).toBe(`/admin/orgs/${org}?tab=promo`)
  })
})
