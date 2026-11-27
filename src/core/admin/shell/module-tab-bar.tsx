'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '../../ui/cn'
import { moduleTabs } from './module-tabs'

// The tabs of the module the page belongs to, above the page (模板与系列, 出图设置). Real links:
// each tab is its own page.
export function ModuleTabBar() {
  const found = moduleTabs(usePathname())
  if (!found) return null
  return (
    <nav aria-label={found.module.label} className="border-b border-border px-4 md:px-6">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {found.module.tabs.map((tab) => {
          const current = tab === found.current
          return (
            <li key={tab.href} className="shrink-0">
              <Link href={tab.href} aria-current={current ? 'page' : undefined}
                className={cn('flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors',
                  current ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
