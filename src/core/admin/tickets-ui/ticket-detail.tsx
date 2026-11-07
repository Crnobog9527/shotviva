import Link from 'next/link'

import type { ShownAdminTicket as AdminTicket } from '@/core/support'
import { MessageImages } from '@/core/support/ui'
import { Badge } from '@/core/ui/badge'
import { cn } from '@/core/ui/cn'

import { StatCard } from '../shell/admin-blocks'
import { formatBeijing } from '../shell/format'
import { accountLabel } from '../users/label'
import type { UserDetail } from '../users/types'
import { TICKETS_COPY as COPY } from './copy'
import { RefundPanel, PaymentFacts } from './refund-panel'
import { ReplyForm } from './reply-form'
import type { TicketAdminActions } from './use-ticket-action'
import { UserLink } from '../users-ui/user-link'

type Props = { ticket: AdminTicket; user: UserDetail | null; stripeLive: boolean; actions: TicketAdminActions }

// /admin/tickets/[id]: the thread, who wrote it (A2's user summary), what it points at, and for
// refund requests the review panel. Replying is the last block.
export function TicketDetailView({ ticket, user, stripeLive, actions }: Props) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/tickets" className="text-sm text-primary hover:underline">
          {COPY.back}
        </Link>
        <Badge variant={ticket.status === 'open' ? 'default' : 'secondary'}>{COPY.statuses[ticket.status]}</Badge>
        <span className="text-sm text-muted-foreground">{COPY.types[ticket.type]}</span>
        <span className="font-mono text-xs text-muted-foreground">{formatBeijing(ticket.createdAt)}</span>
      </div>
      <UserSummary ticket={ticket} user={user} />
      <Thread ticket={ticket} />
      <Attached ticket={ticket} stripeLive={stripeLive} decide={actions.decide} />
      <ReplyForm ticketId={ticket.id} closed={ticket.status === 'closed'} reply={actions.reply} />
    </div>
  )
}

function UserSummary({ ticket, user }: { ticket: AdminTicket; user: UserDetail | null }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{COPY.user.heading}</h2>
        <span className="text-sm">{user ? accountLabel(user) : ticket.userId}</span>
        {user?.bannedAt ? <Badge variant="destructive">{COPY.user.banned}</Badge> : null}
        <UserLink userId={ticket.userId} className="text-sm">
          {COPY.user.open}
        </UserLink>
      </div>
      {user && <UserStats user={user} />}
      {ticket.jobId && (
        <p className="text-sm">
          {COPY.user.work}：<span className="font-mono text-xs">{ticket.jobId}</span>
        </p>
      )}
    </section>
  )
}

const day = (iso: string | null) => formatBeijing(iso)?.slice(0, 10) ?? '—'

function UserStats({ user }: { user: UserDetail }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard title={COPY.user.paid} value={String(user.credits)} />
      <StatCard title={COPY.user.free} value={String(user.freeCredits)} />
      <StatCard title={COPY.user.paidUntil} value={day(user.paidUntil)} />
      <StatCard title={COPY.user.registered} value={day(user.createdAt)} />
    </div>
  )
}

function Thread({ ticket }: { ticket: AdminTicket }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{COPY.thread.heading}</h2>
      <ol className="grid gap-2">
        {ticket.messages.map((message) => (
          <li key={message.id} className={cn('rounded-lg border border-border p-3', message.author === 'admin' && 'bg-muted')}>
            <p className="flex gap-3 text-xs text-muted-foreground">
              <span className="font-semibold">{COPY.thread[message.author]}</span>
              <span className="font-mono">{formatBeijing(message.createdAt)}</span>
            </p>
            <p className="mt-1 text-sm break-words whitespace-pre-wrap">{message.body}</p>
            <MessageImages images={message.images} openLabel={COPY.thread.openImage} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function Attached({ ticket, stripeLive, decide }: { ticket: AdminTicket; stripeLive: boolean; decide: TicketAdminActions['decide'] }) {
  if (!ticket.payment) return null
  const decided = ticket.refundDecision ? { decision: ticket.refundDecision, amountCents: ticket.refundAmountCents } : null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PaymentFacts payment={ticket.payment} stripeLive={stripeLive} />
      {ticket.type === 'refund' && ticket.eligibility ? (
        <RefundPanel ticketId={ticket.id} payment={ticket.payment} eligibility={ticket.eligibility} decided={decided} decide={decide} />
      ) : null}
    </div>
  )
}
