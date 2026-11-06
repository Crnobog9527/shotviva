import { describe, expect, it } from 'vitest'

import { toCents } from './refund-decision-form'
import { ticketsHref } from './tickets-view'

describe('refund amount input', () => {
  it('turns typed dollars into cents and refuses anything else', () => {
    expect(toCents('18.80')).toBe(1880)
    expect(toCents(' 19.9 ')).toBe(1990)
    expect(toCents('20')).toBe(2000)
    expect(toCents('0')).toBeNull()
    expect(toCents('1.234')).toBeNull()
    expect(toCents('-5')).toBeNull()
    expect(toCents('abc')).toBeNull()
  })
})

describe('ticket list links', () => {
  it('leaves the default (open, all types) out of the address', () => {
    expect(ticketsHref({ status: 'open' })).toBe('/admin/tickets')
    expect(ticketsHref({ status: 'all', type: 'refund' }, 'abc')).toBe('/admin/tickets?status=all&type=refund&cursor=abc')
  })
})
