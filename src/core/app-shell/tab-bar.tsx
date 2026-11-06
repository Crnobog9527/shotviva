'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { usePathname } from '../i18n/navigation'
import { Link } from '../i18n/ui'
import { cn } from '../ui/cn'
import { TabGlyph, type TabIcon } from './tab-icons'

export type TabItem = { href: `/${string}`; label: string; icon: TabIcon; badge?: ReactNode }

const isRoot = (pathname: string, items: readonly TabItem[]) =>
  items.some((item) => pathname === item.href || pathname === `${item.href}/`)

// The app shell's tabs (DESIGN §8.2): fixed at the bottom on phones, 50px rows plus the safe
// area, only on tab roots; flow pages (workspace, result) push in without it. From md up the
// same items become the right-hand links of a sticky top bar (§8.6). Three or four equal
// columns. AppFrame reserves room for it through data-tabbar.
export function TabBar({ items, brand }: { items: readonly TabItem[]; brand: string }) {
  const pathname = usePathname()
  const t = useTranslations('app.tabs')
  if (!isRoot(pathname, items)) return null
  return (
    <nav
      aria-label={t('label')}
      data-tabbar=""
      className={cn(
        'bar-material fixed inset-x-0 bottom-0 z-60 grid px-2 pt-1 pb-[calc(var(--sab)+4px)]',
        items.length === 4 ? 'grid-cols-4' : 'grid-cols-3',
        'md:sticky md:top-0 md:bottom-auto md:flex md:h-16 md:items-center md:justify-end md:gap-2 md:px-6 md:pb-0 md:shadow-[inset_0_-1px_0_var(--border)]',
      )}
    >
      <span className="mr-auto hidden font-display text-[28px] leading-none md:block">
        {brand}
        <span className="text-primary">.</span>
      </span>
      {items.map((item) => (
        <TabLink key={item.href} item={item} current={pathname.startsWith(item.href)} />
      ))}
    </nav>
  )
}

function TabLink({ item, current }: { item: TabItem; current: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'press relative flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-1 px-1 text-center text-caption leading-tight font-medium break-words',
        'md:min-h-11 md:flex-row md:gap-2 md:rounded-full md:px-4',
        current ? 'text-foreground md:bg-wash' : 'text-muted-foreground',
      )}
    >
      <TabGlyph icon={item.icon} className={cn('size-6 md:size-5', current && 'text-primary')} />
      {item.label}
      {item.badge}
    </Link>
  )
}
