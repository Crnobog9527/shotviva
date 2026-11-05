import type { Metadata } from 'next'

import { AdminPage, EmptyState, ORDERS_COPY } from '@/core/admin'
import { requireAdmin } from '@/core/auth'

// Placeholder until T9's orders / subscriptions tables are on main (T23 PR B fills it in).
// Never shows sample numbers.
export const instant = false

export const metadata: Metadata = { title: ORDERS_COPY.title }

export default async function AdminOrdersPage() {
  await requireAdmin()
  return (
    <AdminPage title={ORDERS_COPY.title}>
      <EmptyState title={ORDERS_COPY.pendingTitle} body={ORDERS_COPY.pendingBody} />
    </AdminPage>
  )
}
