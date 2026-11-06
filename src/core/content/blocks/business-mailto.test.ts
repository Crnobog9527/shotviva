import { describe, expect, it } from 'vitest'

import { businessMailto } from './business-mailto'

describe('businessMailto (DESIGN §6.9 item 8)', () => {
  it('fills the subject and one prompt a line, with %20 for spaces', () => {
    const href = businessMailto('support@shotviva.com', 'Business inquiry — Shotviva', ['Company:', 'Monthly photo volume:'])
    expect(href).toBe('mailto:support@shotviva.com?subject=Business%20inquiry%20%E2%80%94%20Shotviva&body=Company%3A%0AMonthly%20photo%20volume%3A%0A')
    expect(href).not.toContain('+')
    const url = new URL(href)
    expect(url.searchParams.get('subject')).toBe('Business inquiry — Shotviva')
    expect(url.searchParams.get('body')).toBe('Company:\nMonthly photo volume:\n')
  })
})
