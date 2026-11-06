import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, loadUser } from '@/core/admin'
import { TICKETS_COPY, TicketDetailView } from '@/core/admin/tickets-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { loadAdminTicket } from '@/core/support'

import { decideRefundAction, replyTicketAction } from '../actions'

export const instant = false

export const metadata: Metadata = { title: TICKETS_COPY.detailTitle }

// The ticket by primary key (with its payment and, for refunds, the three checks), then its
// author: profiles primary key plus Auth for the email.
export default async function AdminTicketPage({ params }: PageProps<'/[locale]/admin/tickets/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const db = createAdminSupabase()
  const ticket = await loadAdminTicket(db, id)
  if (!ticket) notFound()
  const user = await loadUser(db, ticket.userId)
  return (
    <AdminPage title={TICKETS_COPY.detailTitle}>
      <TicketDetailView
        ticket={ticket}
        user={user}
        stripeLive={serverEnv().VERCEL_ENV === 'production'}
        actions={{ reply: replyTicketAction, decide: decideRefundAction }}
      />
    </AdminPage>
  )
}
