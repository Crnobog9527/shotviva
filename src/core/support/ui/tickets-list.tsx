'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'
import type { Page, TicketSummary } from '../types'
import { StatusChip } from './status-chip'
import { UnreadDot } from './unread-dot'
import { usePaged, type LoadPage } from './use-paged'

type Props = { first: Page<TicketSummary>; loadMore: LoadPage<TicketSummary>; onOpen(ticket: TicketSummary): void }

// My tickets (ARCHITECTURE §10 「站内工单」): newest first, each with its state and, after an
// Owner reply the user has not opened yet, the "new reply" dot. A row opens the ticket in the
// dialog. The empty case is the dialog's.
export function TicketsList({ first, loadMore, onOpen }: Props) {
  const t = useTranslations('app.support')
  const list = usePaged(first, loadMore)
  return (
    <div className="grid gap-3">
      <ul className="hairline-lit grid overflow-hidden rounded-panel bg-card">
        {list.items.map((ticket) => (
          <li key={ticket.id} className="not-last:shadow-[inset_0_-1px_0_var(--border)]">
            <TicketRow ticket={ticket} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {list.hasMore && (
        <div className="grid justify-items-center gap-2">
          {list.failed && (
            <p role="alert" className="text-caption text-destructive">
              {t('loadFailed')}
            </p>
          )}
          <button type="button" onClick={list.more} disabled={list.loading} className={buttonVariants({ variant: 'glass', size: 'touch' })}>
            {t(list.loading ? 'loading' : 'showMore')}
          </button>
        </div>
      )}
    </div>
  )
}

function TicketRow({ ticket, onOpen }: { ticket: TicketSummary; onOpen(ticket: TicketSummary): void }) {
  const t = useTranslations('app.support')
  const format = useFormatter()
  return (
    <button type="button" onClick={() => onOpen(ticket)} className="press flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="flex items-center gap-2 text-body font-medium">
          {t(`types.${ticket.type}`)}
          {ticket.unread && <UnreadDot label={t('newReply')} />}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          {format.dateTime(new Date(ticket.createdAt), { dateStyle: 'medium' })}
        </span>
      </span>
      <StatusChip status={ticket.status} />
    </button>
  )
}
