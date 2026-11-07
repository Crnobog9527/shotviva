import { describe, expect, it } from 'vitest'

import { accountLabel, formatAdminPhone } from './label'

// T63: an admin row names a phone account by its number when it has no email.
describe('accountLabel', () => {
  it('prefers the email, then the grouped phone, then the id', () => {
    expect(accountLabel({ id: 'u1', email: 'mei@example.com', phone: '8614000000001' })).toBe('mei@example.com')
    expect(accountLabel({ id: 'u1', email: null, phone: '8614000000001' })).toBe('+86 140 0000 0001')
    expect(accountLabel({ id: 'u1', email: '', phone: null })).toBe('u1')
    expect(formatAdminPhone('14155550123')).toBe('+14155550123')
  })
})
