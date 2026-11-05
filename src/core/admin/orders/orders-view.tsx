import Link from 'next/link'

import type { Page } from '../cursor'
import { ORDERS_COPY as COPY } from './copy'
import { PurchasesTable } from './purchases-table'
import type { AdminPurchase, AdminSubscription } from './repository'
import type { RevenueStats } from './revenue'
import { RevenueByProduct, RevenueCards } from './revenue-summary'
import { SubscriptionsTable } from './subscriptions-table'

type Props = {
  stats: RevenueStats
  purchases: Page<AdminPurchase>
  subscriptions: Page<AdminSubscription>
  // Which cursor each list is on, to build the other list's links.
  cursors: { purchases: string | null; subscriptions: string | null }
  stripeLive: boolean
}

function pageHref(purchases: string | null, subscriptions: string | null) {
  const params = new URLSearchParams()
  if (purchases) params.set('p', purchases)
  if (subscriptions) params.set('s', subscriptions)
  const query = params.toString()
  return query ? `/admin/orders?${query}` : '/admin/orders'
}

function Pager({ current, next, href }: { current: string | null; next: string | null; href: (cursor: string | null) => string }) {
  return (
    <div className="flex gap-4 text-sm">
      {current ? (
        <Link href={href(null)} className="text-primary hover:underline">
          {COPY.first}
        </Link>
      ) : null}
      {next ? (
        <Link href={href(next)} className="text-primary hover:underline">
          {COPY.next}
        </Link>
      ) : null}
    </div>
  )
}

// /admin/orders (ARCHITECTURE §10, Plan A): list-price revenue, purchases, subscriptions.
export function OrdersView({ stats, purchases, subscriptions, cursors, stripeLive }: Props) {
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{COPY.priceNote}</p>
      <RevenueCards stats={stats} />
      <RevenueByProduct stats={stats} />
      <section className="grid gap-2">
        <h2 className="font-semibold">{COPY.purchasesTitle}</h2>
        <PurchasesTable purchases={purchases.items} stripeLive={stripeLive} />
        <Pager current={cursors.purchases} next={purchases.nextCursor} href={(c) => pageHref(c, cursors.subscriptions)} />
      </section>
      <section className="grid gap-2">
        <h2 className="font-semibold">{COPY.subscriptionsTitle}</h2>
        <SubscriptionsTable subscriptions={subscriptions.items} counts={stats.subscriptions} stripeLive={stripeLive} />
        <Pager current={cursors.subscriptions} next={subscriptions.nextCursor} href={(c) => pageHref(cursors.purchases, c)} />
      </section>
    </div>
  )
}
