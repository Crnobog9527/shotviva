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

describe('ticket rows open the dialog', () => {
  it('links a row to the list with ?ticket=<id>, not to a detail page', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { TicketsView } = await import('./tickets-view')
    const id = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
    const row = {
      id, userId: '0b6f3f0e-5d1c-4c47-9a49-6a3f6f8d2e11', email: 'a@example.com', type: 'feedback', status: 'open', refundDecision: null,
      createdAt: '2026-11-13T00:00:00Z', lastMessageAt: '2026-11-13T00:00:00Z', preview: 'Hello', tier: null, dueAt: '2026-11-14T00:00:00Z', overdue: false,
    } as const
    const html = renderToStaticMarkup(createElement(TicketsView, { filter: { status: 'all' }, page: { items: [row], nextCursor: null }, paged: false, bulk: { reply: async () => ({ ok: true as const, value: { done: [], skipped: [] } }) } }))
    expect(html).toContain(`href="/admin/tickets?status=all&amp;ticket=${id}"`)
    expect(html).not.toContain(`/admin/tickets/${id}`)
  })
})
