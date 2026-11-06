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
      {/* The brand sits in a column as wide as the sidebar, so it lines up with the nav labels;
          the right side uses the same gutter as AdminPage. */}
      <header className="flex min-h-14 items-center gap-4 border-b border-border pr-4 md:pr-6 lg:pr-8">
        <span className="shrink-0 pl-4 font-semibold md:w-60 md:pl-7">{SHELL_COPY.brand}</span>
        <AccountLabel email={email} />
        <Link href="/" className="ml-auto shrink-0 text-sm text-primary hover:underline sm:ml-0">
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

// Long addresses truncate with an ellipsis; the full one is in the tooltip.
function AccountLabel({ email }: { email: string | null }) {
  const value = email ?? '—'
  return (
    <span className="ml-auto hidden max-w-[50%] min-w-0 items-baseline gap-1 text-sm text-muted-foreground sm:flex" title={value}>
      <span className="shrink-0">{SHELL_COPY.signedInAs}：</span>
      <span className="min-w-0 truncate">{value}</span>
    </span>
  )
}
