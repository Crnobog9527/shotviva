import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, loadUser } from '@/core/admin'
import { TICKETS_COPY, TicketDetailView } from '@/core/admin/tickets-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { jobRefOrShort } from '@/core/jobs'
import { serverEnv } from '@/core/env'
import { r2Store } from '@/core/storage'
import { loadAdminTicket, loadRenewalReview, showMessages } from '@/core/support'

import { applyClawbackAction, previewClawbackAction } from '../../orders/actions'
import { decideRefundAction, replyTicketAction, resolveRenewalAction } from '../actions'

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
  // Images as short-lived signed URLs (T69), next to the author lookup and the attached work's
  // reference number (T78).
  const [user, messages, jobRef, renewal] = await Promise.all([
    loadUser(db, ticket.userId),
    showMessages(r2Store(), ticket.messages),
    ticket.jobId ? jobRefOrShort(db, ticket.jobId) : null,
    ticket.type === 'billing' ? loadRenewalReview(db, id) : null,
  ])
  return (
    <AdminPage title={TICKETS_COPY.detailTitle}>
      <TicketDetailView
        ticket={{ ...ticket, messages }}
        renewal={renewal}
        user={user}
        jobRef={jobRef}
        stripeLive={serverEnv().VERCEL_ENV === 'production'}
        actions={{ resolveRenewal: resolveRenewalAction, reply: replyTicketAction, decide: decideRefundAction, clawback: { preview: previewClawbackAction, apply: applyClawbackAction } }}
      />
    </AdminPage>
  )
}
