'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'
import type { Page, TicketSummary } from '../types'
import { StatusChip } from './status-chip'
import { UnreadDot } from './unread-dot'
import { usePaged, type LoadPage } from './use-paged'

// My tickets (ARCHITECTURE §10 「站内工单」): newest first, each with its state and, after an
// Owner reply the user has not opened yet, the "new reply" dot.
export function TicketsList({ first, loadMore }: { first: Page<TicketSummary>; loadMore: LoadPage<TicketSummary> }) {
  const t = useTranslations('app.support')
  const list = usePaged(first, loadMore)
  if (list.items.length === 0) return <p className="px-2 pt-4 text-body text-muted-foreground">{t('empty')}</p>
  return (
    <div className="grid gap-3">
      <ul className="hairline-lit grid overflow-hidden rounded-panel bg-card">
        {list.items.map((ticket) => (
          <li key={ticket.id} className="not-last:shadow-[inset_0_-1px_0_var(--border)]">
            <TicketRow ticket={ticket} />
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

function TicketRow({ ticket }: { ticket: TicketSummary }) {
  const t = useTranslations('app.support')
  const format = useFormatter()
  return (
    <Link href={`/account/help/${ticket.id}`} className="press flex min-h-16 items-center gap-3 px-4 py-3">
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
    </Link>
  )
}
