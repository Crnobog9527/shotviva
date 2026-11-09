import { describe, expect, it } from 'vitest'

import { adminNavItems, currentItem, isCurrent } from './nav-items'

describe('admin nav', () => {
  it('lists the T23 pages in order and drops the review entry while the wishlist is off', () => {
    expect(adminNavItems({ wishlist: true }).map((item) => item.key)).toEqual([
      'overview',
      'analytics',
      'users',
      'tickets',
      'inquiries',
      'orders',
      'disputes',
      'jobs',
      'costs',
      'templates',
      'providers',
      'requests',
      'announcements',
      'features',
    ])
    expect(adminNavItems({ wishlist: false }).map((item) => item.key)).not.toContain('requests')
  })

  it('only links to the affiliate program while enabled', () => {
    expect(adminNavItems({ wishlist: false, affiliate: true }).map(item => item.href)).toContain('/admin/affiliates')
    expect(adminNavItems({ wishlist: false, affiliate: false }).map(item => item.href)).not.toContain('/admin/affiliates')
  })

  it('shows the open-ticket count on 工单 only, and none at 0 (T27)', () => {
    const items = adminNavItems({ wishlist: false }, { tickets: 4 })
    expect(items.find((item) => item.key === 'tickets')?.count).toBe(4)
    expect(items.filter((item) => item.count !== undefined)).toHaveLength(1)
    expect(adminNavItems({ wishlist: false }, { tickets: 0 }).find((item) => item.key === 'tickets')?.count).toBeUndefined()
  })

  it('shows the new-inquiry count on 企业咨询, beside 工单 (T86)', () => {
    const items = adminNavItems({ wishlist: false }, { tickets: 2, inquiries: 3 })
    expect(items.find((item) => item.key === 'inquiries')).toMatchObject({ href: '/admin/inquiries', label: '企业咨询', count: 3 })
    expect(items.find((item) => item.key === 'tickets')?.count).toBe(2)
    expect(adminNavItems({ wishlist: false }, { inquiries: 0 }).find((item) => item.key === 'inquiries')?.count).toBeUndefined()
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
