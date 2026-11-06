import type { Metadata } from 'next'

import { AdminPage } from '@/core/admin'
import { TICKETS_COPY, TicketsView } from '@/core/admin/tickets-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { adminListFilterSchema, listAdminTickets } from '@/core/support'

// Admin-only, request-time page (ARCHITECTURE §10 「站内工单」): open tickets by default. The
// proxy answers non-admins with a 404; requireAdmin() stays the authoritative check.
export const instant = false

export const metadata: Metadata = { title: TICKETS_COPY.title }

export default async function AdminTicketsPage({ searchParams }: PageProps<'/[locale]/admin/tickets'>) {
  await requireAdmin()
  const params = await searchParams
  const filter = adminListFilterSchema.parse({ status: params.status ?? 'open', type: params.type })
  const cursor = typeof params.cursor === 'string' ? params.cursor : null
  const page = await listAdminTickets(createAdminSupabase(), filter, cursor)
  return (
    <AdminPage title={TICKETS_COPY.title}>
      <TicketsView filter={filter} page={page} paged={cursor !== null} />
    </AdminPage>
  )
}
