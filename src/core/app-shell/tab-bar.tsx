'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { usePathname } from '../i18n/navigation'
import { Link } from '../i18n/ui'
import { cn } from '../ui/cn'
import { TabGlyph, type TabIcon } from './tab-icons'
import { Wordmark } from './wordmark'

export type TabItem = { href: `/${string}`; label: string; icon: TabIcon; badge?: ReactNode }

const isRoot = (pathname: string, items: readonly TabItem[]) =>
  items.some((item) => pathname === item.href || pathname === `${item.href}/`)

type Props = {
  items: readonly TabItem[]
  // Pages below a tab that are still that tab, bar and all: Photos with a work open in its
  // viewer, /photos/<id> (2026-11-12; before, the photo page kept the bar from md up only, T38).
  rootsUnder?: readonly `/${string}/`[]
  // Pages that are not a tab but sit in the full shell like one: the bar on phones and the top
  // bar from md, with no tab marked current (the checkout return page, comps-v3-b
  // checkout.html, gap audit C1).
  shellPages?: readonly `/${string}`[]
  // The Admin item (AdminLink), streamed in its own Suspense by the layout: it reads the
  // session, and the bar itself must not wait for that (see below).
  admin?: ReactNode
}

// The app shell's tabs (DESIGN §8.2, §6.9 item 7): fixed at the bottom on phones, 50px rows
// plus the safe area, only on tab roots; flow pages (workspace, result) push in without it.
// From md up the same items become a 56px top bar, links left-aligned in the content column,
// the current one a bone pill with a safelight glyph, after the wordmark at the far left and
// before the Admin entry at the right end (spec #199). AppFrame reserves the phone bar's room
// through data-tabbar.
//
// Nothing in the bar may read request data: it has to be in every app page's prerendered shell,
// or the page paints from the top of the window and the bar arrives a beat later, pushing it
// down 56px (and, with any scroll at that moment, leaving the page's top under the sticky bar).
// The Admin item comes in as a slot for that reason.
//
// The phone placement is written max-md: only, never `fixed inset-x-0 bottom-0` overridden by
// `md:sticky md:top-0 md:bottom-auto`. Our utilities live in a cascade layer, and any unlayered
// `.fixed` or `.bottom-0` on the page (a browser extension or an automation tool injecting its
// own Tailwind CSS does exactly that) beats every layered rule, md: ones included: the bar then
// stays fixed on desktop over the page's top, and a flow page's action bar covers its bottom.
// With max-md: classes there is no bare `.fixed` on the element for such a rule to match.
export function TabBar({ items, rootsUnder = [], shellPages = [], admin }: Props) {
  const pathname = usePathname()
  const t = useTranslations('app.tabs')
  const root = isRoot(pathname, items) || shellPages.some((page) => pathname === page || pathname === `${page}/`) || rootsUnder.some((prefix) => pathname.startsWith(prefix))
  if (!root) return null
  return (
    <nav
      aria-label={t('label')}
      data-tabbar=''
      // Stays put while pages slide or fade under it (T56; globals.css).
      style={{ viewTransitionName: 'app-tabs' }}
      className={cn(
        'bar-material z-60 px-2 pt-1 pb-[calc(var(--sab)+4px)] max-md:fixed max-md:inset-x-0 max-md:bottom-0',
        'md:sticky md:top-0 md:h-14 md:p-0 md:shadow-[inset_0_-1px_0_var(--border)]',
      )}
    >
      <div className={cn('grid md:content-column md:flex md:h-full md:items-center md:gap-1 md:px-(--gutter)', items.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
        <Wordmark className="hidden md:mr-4 md:inline-flex" />
        {items.map((item) => (
          <TabLink key={item.href} item={item} current={pathname.startsWith(item.href)} />
        ))}
        {admin}
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
