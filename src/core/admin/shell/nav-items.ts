import { SHELL_COPY, type AdminNavKey } from './copy'

// count: a to-do number shown beside the label (open tickets, new inquiries), hidden at 0.
export type AdminNavItem = { key: AdminNavKey; href: `/admin${string}`; label: string; count?: number }

// Order fixed by T23 / ARCHITECTURE §10; later pages append.
const ITEMS: readonly { key: AdminNavKey; href: `/admin${string}` }[] = [
  { key: 'overview', href: '/admin' },
  // T74 (ARCHITECTURE §16.2a): traffic and conversion from PostHog, next to the business overview.
  { key: 'analytics', href: '/admin/analytics' },
  { key: 'users', href: '/admin/users' },
  { key: 'tickets', href: '/admin/tickets' },
  // T86 (ARCHITECTURE §10.c): business inquiries from the pricing page, next to the tickets.
  { key: 'inquiries', href: '/admin/inquiries' },
  { key: 'orders', href: '/admin/orders' },
  { key: 'products', href: '/admin/products' },
  { key: 'codes', href: '/admin/codes' },
  { key: 'affiliates', href: '/admin/affiliates' },
  // T82 (ARCHITECTURE §6.3 「后台拒付页」), next to the payments it is about.
  { key: 'disputes', href: '/admin/disputes' },
  { key: 'jobs', href: '/admin/jobs' },
  // T33 (ARCHITECTURE §10.0), next to the jobs whose cost it reconciles.
  { key: 'costs', href: '/admin/costs' },
  { key: 'templates', href: '/admin/templates' },
  { key: 'providers', href: '/admin/providers' },
  { key: 'requests', href: '/admin/requests' },
  { key: 'announcements', href: '/admin/announcements' },
  // T29 (ARCHITECTURE §6.2 新功能抢先用).
  { key: 'features', href: '/admin/features' },
]

export type NavCounts = { tickets?: number; inquiries?: number }

// The review entry only exists while the wishlist does (ARCHITECTURE §15.6). Tickets carry the
// open count (ARCHITECTURE §10 「站内工单」), inquiries the new ones (§10.c).
export function adminNavItems(flags: { wishlist: boolean; affiliate?: boolean }, counts: NavCounts = {}): AdminNavItem[] {
  const visible = ITEMS.filter((item) => item.key !== 'affiliates' || flags.affiliate)
    .filter((item) => item.key !== 'requests' || flags.wishlist)
  return visible.map((item) => {
    const count = item.key === 'tickets' || item.key === 'inquiries' ? counts[item.key] : undefined
    return { ...item, label: SHELL_COPY.nav[item.key], ...(count ? { count } : {}) }
  })
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
