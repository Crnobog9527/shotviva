import { SHELL_COPY, type AdminNavKey } from './copy'

// count: a to-do number shown beside the label (open tickets, new inquiries), hidden at 0.
// covers: other pages the entry stands for (出图设置 covers pages under /admin/templates); the
// longest matching path decides which entry is current.
export type AdminNavItem = { key: AdminNavKey; href: `/admin${string}`; label: string; count?: number; covers?: readonly string[] }

export const GENERATION_PAGES = ['/admin/templates/profiles', '/admin/templates/dishware', '/admin/templates/edit'] as const

// Order fixed by T23 / ARCHITECTURE §10; later pages append.
const ITEMS: readonly { key: AdminNavKey; href: `/admin${string}`; covers?: readonly string[] }[] = [
  { key: 'overview', href: '/admin' },
  // T74 (ARCHITECTURE §16.2a): traffic and conversion from PostHog, next to the business overview.
  { key: 'analytics', href: '/admin/analytics' },
  // A/B experiments (ARCHITECTURE §16.5), next to the traffic they split.
  { key: 'experiments', href: '/admin/experiments' },
  { key: 'users', href: '/admin/users' },
  { key: 'tickets', href: '/admin/tickets' },
  // T86 (ARCHITECTURE §10.c): business inquiries from the pricing page, next to the tickets.
  { key: 'inquiries', href: '/admin/inquiries' },
  { key: 'orders', href: '/admin/orders' },
  { key: 'products', href: '/admin/products' },
  { key: 'codes', href: '/admin/codes' },
  { key: 'affiliates', href: '/admin/affiliates' },
  // Enterprise customers (ARCHITECTURE §6.5, E3): packages bought offline, credit pool, usage lifts.
  { key: 'orgs', href: '/admin/orgs' },
  // T82 (ARCHITECTURE §6.3 「后台拒付页」), next to the payments it is about.
  { key: 'disputes', href: '/admin/disputes' },
  { key: 'jobs', href: '/admin/jobs' },
  // Free works' tracking mark read back (ARCHITECTURE §6.2, 2026-11-22), next to the jobs it names.
  { key: 'trace', href: '/admin/trace' },
  // T33 (ARCHITECTURE §10.0), next to the jobs whose cost it reconciles.
  { key: 'costs', href: '/admin/costs' },
  // The template area as three modules (Owner 2026-11-27, design/admin-templates-ux-plan.md):
  // 模板与系列, 首页展示 (for now the home sections on /admin/templates; its own page comes next) and
  // 出图设置, which gathers AI 供应商 with the generation pages that sat under /admin/templates.
  { key: 'templates', href: '/admin/templates' },
  { key: 'home', href: '/admin/templates#home-display' },
  { key: 'generation', href: '/admin/providers', covers: GENERATION_PAGES },
  { key: 'references', href: '/admin/references' },
  { key: 'requests', href: '/admin/requests' },
  // T108 (ARCHITECTURE §9 第 5 条): public works waiting for a person, next to the other review.
  { key: 'gallery', href: '/admin/gallery' },
  { key: 'announcements', href: '/admin/announcements' },
  // The blog's posts (ARCHITECTURE §12.6).
  { key: 'blog', href: '/admin/blog' },
  // T29 (ARCHITECTURE §6.2 新功能抢先用).
  { key: 'features', href: '/admin/features' },
]

const COUNTED: ReadonlySet<AdminNavKey> = new Set(['tickets', 'inquiries', 'gallery', 'affiliates'])

export type NavCounts = { tickets?: number; inquiries?: number; gallery?: number; affiliates?: number }

// The review entry only exists while the wishlist does (ARCHITECTURE §15.6). Tickets carry the
// open count (ARCHITECTURE §10 「站内工单」), inquiries the new ones (§10.c), the affiliate program the
// promotion grant sheets waiting for a confirm (§6.5 渠道商推广积分).
export function adminNavItems(
  flags: { wishlist: boolean; affiliate?: boolean; gallery?: boolean },
  counts: NavCounts = {},
): AdminNavItem[] {
  const visible = ITEMS.filter((item) => item.key !== 'affiliates' || flags.affiliate)
    .filter((item) => item.key !== 'requests' || flags.wishlist)
    .filter((item) => item.key !== 'gallery' || flags.gallery)
  return visible.map((item) => {
    const count = COUNTED.has(item.key) ? counts[item.key as keyof NavCounts] : undefined
    return { ...item, label: SHELL_COPY.nav[item.key], ...(count ? { count } : {}) }
  })
}

const trimmed = (path: string) => (path.length > 1 ? path.replace(/\/$/, '') : path)

// /admin is only current on itself; every other path also covers its sub-pages. The fragment of
// a link (首页展示's #home-display) does not count.
export function isCurrent(pathname: string, href: string): boolean {
  return matchLength(pathname, href) > 0
}

function matchLength(pathname: string, href: string): number {
  const path = trimmed(pathname)
  const base = href.split('#')[0]
  if (base === '/admin') return path === '/admin' ? base.length : 0
  return path === base || path.startsWith(`${base}/`) ? base.length : 0
}

// The most specific match wins: /admin/templates/profiles is 出图设置, not 模板与系列. On a tie
// the earlier entry wins.
export function bestMatch<T>(pathname: string, entries: readonly T[], pathsOf: (entry: T) => readonly string[]): T | undefined {
  let best: T | undefined
  let length = 0
  for (const entry of entries) {
    const longest = Math.max(0, ...pathsOf(entry).map((href) => matchLength(pathname, href)))
    if (longest > length) [best, length] = [entry, longest]
  }
  return best
}

export function currentItem(pathname: string, items: readonly AdminNavItem[]): AdminNavItem | undefined {
  return bestMatch(pathname, items, (item) => [item.href, ...(item.covers ?? [])])
}
