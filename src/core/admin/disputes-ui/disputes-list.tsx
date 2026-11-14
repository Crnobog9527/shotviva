import Link from 'next/link'

import { disputeAdminPath } from '@/core/billing/stripe'

import { EmptyState } from '../shell'
import { DISPUTES_COPY as COPY } from '../disputes/copy'
import { StatusBadge } from './status-badge'
import type { DisputeCard } from './view-model'

// One card per dispute, the same at every width: a dispute needs amount, reason, deadline and
// who answers at a glance, which a wide table hides on a phone.

function Card({ card }: { card: DisputeCard }) {
  return (
    <li>
      <Link
        href={disputeAdminPath(card.id)}
        className="grid gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-semibold tabular-nums">{card.amount}</span>
          <StatusBadge label={card.status} tone={card.tone} />
          {card.banned ? <span className="text-xs text-muted-foreground">{COPY.bannedTag}</span> : null}
          <span className="ml-auto text-sm text-primary">{COPY.open} →</span>
        </div>
        <p className="text-sm">{card.reason}</p>
        <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="sr-only">{COPY.columns.user}</dt>
            <dd className="truncate">{card.user}</dd>
          </div>
          <div>
            <dt className="sr-only">{card.due ? COPY.columns.due : COPY.columns.received}</dt>
            <dd className={card.tone === 'urgent' ? 'font-medium text-foreground' : undefined}>
              {card.due ? (
                <>
                  {COPY.columns.due} <span className="whitespace-nowrap">{card.due}</span>
                  {card.daysLeft ? <span className="whitespace-nowrap"> · {card.daysLeft}</span> : null}
                </>
              ) : (
                `${COPY.columns.received} ${card.received}`
              )}
            </dd>
          </div>
          <div>
            <dt className="sr-only">{COPY.columns.responder}</dt>
            <dd>{card.responder}</dd>
          </div>
        </dl>
      </Link>
    </li>
  )
}

export function DisputesList({ cards, nextHref }: { cards: DisputeCard[]; nextHref: string | null }) {
  if (cards.length === 0) return <EmptyState title={COPY.empty} body={COPY.emptyBody} />
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {cards.map((card) => (
          <Card key={card.id} card={card} />
        ))}
      </ul>
      {nextHref ? (
        <Link href={nextHref} className="justify-self-start text-sm text-primary hover:underline">
          {COPY.next}
        </Link>
      ) : null}
    </div>
  )
}
