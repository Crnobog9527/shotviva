import { describe, expect, it } from 'vitest'

import { adminNavItems, currentItem, isCurrent } from './nav-items'

describe('admin nav', () => {
  it('lists the T23 pages in order and drops the review entry while the wishlist is off', () => {
    expect(adminNavItems({ wishlist: true }).map((item) => item.key)).toEqual([
      'overview',
      'users',
      'orders',
      'jobs',
      'templates',
      'providers',
      'requests',
      'announcements',
      'features',
    ])
    expect(adminNavItems({ wishlist: false }).map((item) => item.key)).not.toContain('requests')
  })

  it('highlights the overview only on /admin and other entries on their sub-pages', () => {
    expect(isCurrent('/admin', '/admin')).toBe(true)
    expect(isCurrent('/admin/', '/admin')).toBe(true)
    expect(isCurrent('/admin/users', '/admin')).toBe(false)
    expect(isCurrent('/admin/users/abc', '/admin/users')).toBe(true)
    expect(isCurrent('/admin/usersx', '/admin/users')).toBe(false)
    expect(currentItem('/admin/jobs', adminNavItems({ wishlist: false }))?.key).toBe('jobs')
  })
})
