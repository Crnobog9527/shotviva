import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AdminPage } from '@/core/admin'
import { TICKETS_COPY, TicketDialogHost, TicketsView } from '@/core/admin/tickets-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { adminListFilterSchema, listAdminTickets } from '@/core/support'

import { applyClawbackAction, previewClawbackAction } from '../orders/actions'
import { decideRefundAction, replyTicketAction, resolveRenewalAction, ticketDetailAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §10 「站内工单」): open tickets by default. The
// proxy answers non-admins with a 404; requireAdmin() stays the authoritative check. A ticket opens
// in a dialog over the list (?ticket=<id>), so the filter and scroll position stay put.
export const instant = false

export const metadata: Metadata = { title: TICKETS_COPY.title }

const ticketActions = {
  reply: replyTicketAction,
  decide: decideRefundAction,
  resolveRenewal: resolveRenewalAction,
  clawback: { preview: previewClawbackAction, apply: applyClawbackAction },
}

export default async function AdminTicketsPage({ searchParams }: PageProps<'/[locale]/admin/tickets'>) {
  await requireAdmin()
  const params = await searchParams
  const filter = adminListFilterSchema.parse({ status: params.status ?? 'open', type: params.type })
  const cursor = typeof params.cursor === 'string' ? params.cursor : null
  const page = await listAdminTickets(createAdminSupabase(), filter, cursor)
  return (
    <AdminPage title={TICKETS_COPY.title}>
      <TicketsView filter={filter} page={page} paged={cursor !== null} />
      <Suspense>
        <TicketDialogHost load={ticketDetailAction} actions={ticketActions} stripeLive={serverEnv().VERCEL_ENV === 'production'} />
      </Suspense>
    </AdminPage>
  )
}
