import Link from 'next/link'
import type { ReactNode } from 'react'

import { AdminMobileNav, AdminSidebar } from './admin-nav'
import { SHELL_COPY } from './copy'
import type { AdminNavItem } from './nav-items'

type Props = { items: readonly AdminNavItem[]; email: string | null; children: ReactNode }

// Admin frame (DESIGN §7): top bar with the account and a way back to the site, left nav on
// desktop, a dropdown on phones. B tokens only; no separate admin theme.
export function AdminShell({ items, email, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex min-h-14 items-center gap-3 border-b border-border px-4 md:px-6">
        <span className="font-semibold">{SHELL_COPY.brand}</span>
        <span className="ml-auto hidden min-w-0 truncate text-sm text-muted-foreground sm:block">
          {SHELL_COPY.signedInAs}：{email ?? '—'}
        </span>
        {/* Back to the app, not the marketing home, which reads as signed out (DESIGN §6.9 item 4). */}
        <Link href="/generate" className="ml-auto shrink-0 text-sm text-primary hover:underline sm:ml-0">
          {SHELL_COPY.backToSite}
        </Link>
      </header>
      <AdminMobileNav items={items} />
      <div className="flex flex-1">
        <AdminSidebar items={items} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
