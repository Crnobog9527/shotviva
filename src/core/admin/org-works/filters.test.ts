import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { orgWorksHref, parseOrgWorkFilters, workFilter } from './filters'
import { splitCredits } from './repository'

const org = '01234567-1234-4234-8234-123456789abc'
const member = '11111111-2222-4333-8444-555555555555'

describe('org works filters', () => {
  it('keeps valid filters and drops junk instead of failing', () => {
    expect(parseOrgWorkFilters({ member, status: 'failed', work: ' 2fa821c6 ' })).toEqual({ member, status: 'failed', work: '2fa821c6' })
    expect(parseOrgWorkFilters({ member: 'not-a-uuid', status: 'refunded', work: '' })).toEqual({})
    expect(parseOrgWorkFilters({ status: ['succeeded', 'failed'] })).toEqual({ status: 'succeeded' })
  })

  it('reads a whole work id, a reference number or a prefix, and flags anything else', () => {
    expect(workFilter({ work: '2FA821C6-1A2B-4C3D-8E4F-001122334455' })).toEqual({ ref: '2fa821c6-1a2b-4c3d-8e4f-001122334455', invalid: false })
    expect(workFilter({ work: '#2fa821c6' })).toEqual({ ref: '2fa821c6', invalid: false })
    expect(workFilter({})).toEqual({ ref: null, invalid: false })
    expect(workFilter({ work: '2fa82' })).toEqual({ ref: null, invalid: true })
    expect(workFilter({ work: 'or 1=1' })).toEqual({ ref: null, invalid: true })
  })

  it('links back to the works section with the filters, and the next page with its cursor', () => {
    expect(orgWorksHref(org, {})).toBe(`/admin/orgs/${org}?tab=works#works`)
    expect(orgWorksHref(org, { member, status: 'failed' }, 'next')).toBe(`/admin/orgs/${org}?tab=works&member=${member}&status=failed&cursor=next#works`)
  })
})

describe('splitCredits', () => {
  const draw = (drawn: number, restored = 0) => ({ debit_key: 'job:x:reserve', drawn, restored })

  it('attributes a work to the org paid pool, the promotion share, and the member by their draws', () => {
    expect(splitCredits(30, draw(30), undefined)).toEqual({ orgPaid: 30, orgPromo: 0, personal: 0 })
    expect(splitCredits(30, undefined, draw(30))).toEqual({ orgPaid: 0, orgPromo: 30, personal: 0 })
    expect(splitCredits(30, draw(10), draw(5))).toEqual({ orgPaid: 10, orgPromo: 5, personal: 15 })
  })

  it('keeps what was drawn even after a refund restored it', () => {
    expect(splitCredits(30, draw(30, 30), undefined)).toEqual({ orgPaid: 30, orgPromo: 0, personal: 0 })
  })
})
