import type { Metadata } from 'next'

import { AdminPage, DISPUTES_COPY, DisputesList, listDisputes, sendDueReminders, toCard } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { stripeClient } from '@/core/billing/stripe'
import { appOrigin } from '@/core/site-url'

// /admin/disputes (ARCHITECTURE §6.3 「后台拒付页」, T82): every dispute with Stripe's live status.
// Opening it also sends the one 「截止前 3 天」 reminder per dispute (no scheduled job).
export const instant = false

export const metadata: Metadata = { title: DISPUTES_COPY.title }

export default async function AdminDisputesPage({ searchParams }: PageProps<'/[locale]/admin/disputes'>) {
  await requireAdmin()
  const { p } = await searchParams
  const cursor = typeof p === 'string' ? p : null
  const db = createAdminSupabase()
  const page = await listDisputes({ db, stripe: stripeClient() }, cursor)
  await sendDueReminders(db, page.items, appOrigin)
  const now = new Date()
  return (
    <AdminPage title={DISPUTES_COPY.title}>
      <p className="max-w-3xl text-sm text-muted-foreground">{DISPUTES_COPY.intro}</p>
      <DisputesList cards={page.items.map((item) => toCard(item, now))} nextHref={page.nextCursor ? `/admin/disputes?p=${page.nextCursor}` : null} />
    </AdminPage>
  )
}
