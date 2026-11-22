import { describe, expect, it, vi } from 'vitest'

import { billingProfileInput } from './profile'

vi.mock('server-only', () => ({}))

// The form's parse (the SQL function checks the same again, 1961).
describe('billingProfileInput', () => {
  const base = { legalName: '  上海示例科技   有限公司 ', taxId: '91310000ma1fl0000x', country: 'cn' }

  it('normalises: trims and squeezes the name, upper-cases the tax ID and country, blanks become null', () => {
    expect(billingProfileInput.parse({ ...base, postcode: ' ', state: '', invoiceEmail: ' Finance@Example.com ' })).toEqual({
      legalName: '上海示例科技 有限公司', taxId: '91310000MA1FL0000X', country: 'CN', postcode: null, state: null, invoiceEmail: 'finance@example.com',
    })
  })

  it('China needs an 18-character unified social credit code', () => {
    expect(billingProfileInput.safeParse({ ...base, taxId: '12345' }).success).toBe(false)
    expect(billingProfileInput.safeParse({ ...base, taxId: '91310000MA1FL0000O' }).success).toBe(false)
  })

  it('elsewhere a 3–40 character tax ID is enough', () => {
    expect(billingProfileInput.safeParse({ ...base, country: 'SG', taxId: '201912345K' }).success).toBe(true)
    expect(billingProfileInput.safeParse({ ...base, country: 'SG', taxId: 'X' }).success).toBe(false)
  })

  it('refuses control characters, bad emails and bad countries', () => {
    expect(billingProfileInput.safeParse({ ...base, legalName: 'Acme\u0000Ltd' }).success).toBe(false)
    expect(billingProfileInput.safeParse({ ...base, invoiceEmail: 'nope' }).success).toBe(false)
    expect(billingProfileInput.safeParse({ ...base, country: 'CHN' }).success).toBe(false)
  })
})

describe('countries and state codes', () => {
  const base = { legalName: 'Acme Inc', taxId: '12-3456789', country: 'US' }
  it('US, Canada and Australia need a 2–3 letter state code, upper-cased', () => {
    expect(billingProfileInput.safeParse(base).success).toBe(false)
    expect(billingProfileInput.safeParse({ ...base, state: 'California' }).success).toBe(false)
    expect(billingProfileInput.parse({ ...base, state: 'ca' }).state).toBe('CA')
    expect(billingProfileInput.parse({ ...base, country: 'AU', state: 'nsw' }).state).toBe('NSW')
  })
  it('only the offered countries', () => {
    expect(billingProfileInput.safeParse({ ...base, country: 'ZZ', state: 'CA' }).success).toBe(false)
  })
})
