import { describe, expect, it } from 'vitest'

import { isStaffAccount } from './staff'

describe('isStaffAccount', () => {
  it('counts admins and the site QA personas as staff, nobody else', () => {
    expect(isStaffAccount({ role: 'admin', email: null }, 'shotviva.com')).toBe(true)
    expect(isStaffAccount({ role: 'user', email: 'qa-free@shotviva.com' }, 'shotviva.com')).toBe(true)
    expect(isStaffAccount({ role: 'user', email: 'QA-Max@Shotviva.com' }, 'shotviva.com')).toBe(true)
    expect(isStaffAccount({ role: 'user', email: 'qa-free@gmail.com' }, 'shotviva.com')).toBe(false)
    expect(isStaffAccount({ role: 'user', email: 'aqa-x@shotviva.com' }, 'shotviva.com')).toBe(false)
    expect(isStaffAccount({ role: 'user', email: null }, 'shotviva.com')).toBe(false)
  })
})
