import { Suspense } from 'react'

import { AdminShell, adminNavItems, UserDialogHost } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'
import { openTicketCount } from '@/core/support'
import { isWishlistEnabled } from '@/core/wishlist'
import { site } from '@/site/site.config'

import { compensateJobAction, viewWorkAction } from './jobs/actions'
import { adjustCreditsAction, banUserAction, unbanUserAction, userDetailAction } from './users/actions'

// One admin gate for every /admin/* route (T23). The proxy already answers non-admins with a
// 404 before rendering. A layout does not stop its pages from rendering and is not re-run on
// client navigation (Next "Layouts and auth checks"), so pages and server actions still call
// requireAdmin() too; it is cached per request, so that costs no extra round trip.
export const instant = false

// The open-ticket count beside 「工单」: one exact count on the open partial index. A failed read
// only hides the number.
async function ticketCount(): Promise<number> {
  try {
    return await openTicketCount(createAdminSupabase())
  } catch (error) {
    logger.warn('admin.tickets.count.failed', { error })
    return 0
  }
}

// The user detail dialog (T77) opens over whichever admin page has ?user=<id>.
const userDialogActions = {
  load: userDetailAction,
  user: { adjust: adjustCreditsAction, ban: banUserAction, unban: unbanUserAction },
  jobs: { view: viewWorkAction, compensate: compensateJobAction },
}

export default async function AdminLayout({ children }: LayoutProps<'/[locale]/admin'>) {
  const admin = await requireAdmin()
  const [tickets, wishlist] = await Promise.all([ticketCount(), isWishlistEnabled(site)])
  return (
    <AdminShell items={adminNavItems({ wishlist }, { tickets })} email={admin.email}>
      {children}
      <Suspense fallback={null}>
        <UserDialogHost actions={userDialogActions} stripeLive={serverEnv().VERCEL_ENV === 'production'} />
      </Suspense>
    </AdminShell>
  )
}
