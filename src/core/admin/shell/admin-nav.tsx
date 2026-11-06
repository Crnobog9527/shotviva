'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '../../ui/cn'
import { SHELL_COPY } from './copy'
import { currentItem, isCurrent, type AdminNavItem } from './nav-items'

function NavLinks({ items, pathname }: { items: readonly AdminNavItem[]; pathname: string }) {
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const current = isCurrent(pathname, item.href)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors',
                current ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
              {item.count ? (
                <span className="ml-auto rounded-full bg-primary px-2 font-mono text-xs leading-5 text-primary-foreground">
                  {item.count}
                </span>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

// Desktop: the left column (DESIGN §7). Graylum's sidebar shape, our tokens.
export function AdminSidebar({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname()
  return (
    <nav aria-label={SHELL_COPY.navLabel} className="hidden w-56 shrink-0 border-r border-border p-3 md:block">
      <NavLinks items={items} pathname={pathname} />
    </nav>
  )
}

// Phone: the same links folded into a dropdown under the top bar. Real links, no JS router
// calls; keyed on the path so it closes after each navigation.
export function AdminMobileNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname()
  const current = currentItem(pathname, items)
  return (
    <nav aria-label={SHELL_COPY.navLabel} className="border-b border-border px-4 py-2 md:hidden">
      <details key={pathname} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md bg-muted px-3 text-sm font-medium">
          <span>{current?.label ?? SHELL_COPY.menu}</span>
          <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="pt-2">
          <NavLinks items={items} pathname={pathname} />
        </div>
      </details>
    </nav>
  )
}
