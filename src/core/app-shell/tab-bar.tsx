'use client'

import { ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { usePathname } from '../i18n/navigation'
import { Link } from '../i18n/ui'
import { cn } from '../ui/cn'
import type { AdminEntry } from './admin-entry'
import { TabGlyph, type TabIcon } from './tab-icons'
import { Wordmark } from './wordmark'

export type TabItem = { href: `/${string}`; label: string; icon: TabIcon; badge?: ReactNode }

const isRoot = (pathname: string, items: readonly TabItem[]) =>
  items.some((item) => pathname === item.href || pathname === `${item.href}/`)

type Props = {
  items: readonly TabItem[]
  // Pages below a tab that keep the bar from md up (the photo page, T38); phones keep the
  // flow-page rule and show no bar there.
  desktopUnder?: readonly `/${string}/`[]
  admin?: AdminEntry
}

// The app shell's tabs (DESIGN §8.2, §6.9 item 7): fixed at the bottom on phones, 50px rows
// plus the safe area, only on tab roots; flow pages (workspace, result) push in without it.
// From md up the same items become a 56px top bar, links left-aligned in the content column,
// the current one a bone pill with a safelight glyph, after the wordmark at the far left and
// before the Admin entry at the right end (spec #199). AppFrame reserves the phone bar's room
// through data-tabbar.
export function TabBar({ items, desktopUnder = [], admin }: Props) {
  const pathname = usePathname()
  const t = useTranslations('app.tabs')
  const root = isRoot(pathname, items)
  if (!root && !desktopUnder.some((prefix) => pathname.startsWith(prefix))) return null
  return (
    <nav
      aria-label={t('label')}
      data-tabbar={root ? '' : undefined}
      // Stays put while pages slide or fade under it (T56; globals.css).
      style={{ viewTransitionName: 'app-tabs' }}
      className={cn(
        'bar-material fixed inset-x-0 bottom-0 z-60 px-2 pt-1 pb-[calc(var(--sab)+4px)]',
        'md:sticky md:top-0 md:bottom-auto md:h-14 md:p-0 md:shadow-[inset_0_-1px_0_var(--border)]',
        !root && 'max-md:hidden',
      )}
    >
      <div className={cn('grid md:content-column md:flex md:h-full md:items-center md:gap-1 md:px-(--gutter)', items.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        <Wordmark className="hidden md:mr-4 md:inline-flex" />
        {items.map((item) => (
          <TabLink key={item.href} item={item} current={pathname.startsWith(item.href)} />
        ))}
        {admin ? <AdminLink entry={admin} /> : null}
      </div>
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
        'md:min-h-10 md:flex-row md:gap-2 md:rounded-full md:px-3.5 md:text-label md:leading-none',
        current ? 'text-foreground md:bg-wash' : 'text-muted-foreground md:hover:text-foreground',
      )}
    >
      <TabGlyph icon={item.icon} className={cn('size-6 md:size-5', current && 'text-primary')} />
      {item.label}
      {item.badge}
    </Link>
  )
}

// Right end of the desktop top bar. The phone tab bar keeps its fixed slots (DESIGN §8.2):
// on phones the account page's Admin row is the way in.
function AdminLink({ entry }: { entry: AdminEntry }) {
  return (
    <a
      href={entry.href}
      data-admin-entry=""
      className="press hidden min-h-10 items-center gap-2 rounded-full px-3.5 text-label leading-none font-medium text-muted-foreground md:ml-auto md:flex md:hover:text-foreground"
    >
      <ShieldCheck aria-hidden className="size-5" strokeWidth={1.75} />
      {entry.label}
    </a>
  )
}
