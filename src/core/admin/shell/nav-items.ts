import { SHELL_COPY, type AdminNavKey } from './copy'

export type AdminNavItem = { key: AdminNavKey; href: `/admin${string}`; label: string }

// Order fixed by T23 / ARCHITECTURE §10; later pages append.
const ITEMS: readonly { key: AdminNavKey; href: `/admin${string}` }[] = [
  { key: 'overview', href: '/admin' },
  { key: 'users', href: '/admin/users' },
  { key: 'orders', href: '/admin/orders' },
  { key: 'jobs', href: '/admin/jobs' },
  { key: 'templates', href: '/admin/templates' },
  { key: 'providers', href: '/admin/providers' },
  { key: 'requests', href: '/admin/requests' },
  { key: 'announcements', href: '/admin/announcements' },
  // T29 (ARCHITECTURE §6.2 新功能抢先用).
  { key: 'features', href: '/admin/features' },
]

// The review entry only exists while the wishlist does (ARCHITECTURE §15.6).
export function adminNavItems(flags: { wishlist: boolean }): AdminNavItem[] {
  return ITEMS.filter((item) => item.key !== 'requests' || flags.wishlist).map((item) => ({
    ...item,
    label: SHELL_COPY.nav[item.key],
  }))
}

// /admin is only current on itself; every other entry also covers its sub-pages.
export function isCurrent(pathname: string, href: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  if (href === '/admin') return path === '/admin'
  return path === href || path.startsWith(`${href}/`)
}

export function currentItem(pathname: string, items: readonly AdminNavItem[]): AdminNavItem | undefined {
  return items.find((item) => isCurrent(pathname, item.href))
}
