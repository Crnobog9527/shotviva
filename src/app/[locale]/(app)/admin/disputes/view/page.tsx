import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, DISPUTES_COPY, DisputeDetail, reconcileSubmitted } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { loadDisputeRow, loadLiveDispute, stripeClient } from '@/core/billing/stripe'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

import { attachDisputeFileAction, createDisputeUploadAction, saveDisputeTextAction, submitDisputeAction } from '../actions'

// /admin/disputes/view?id=… (T82): our row, and the draft as Stripe holds it now. The Stripe id
// rides in the query, not the path: the proxy sends every mixed-case path to its lowercase form
// (建站规格 R4, core/auth/proxy-gates.ts), and Stripe ids are case-sensitive (du_1UZFae…).
// disputeAdminPath builds this address everywhere it is linked.
export const instant = false

export const metadata: Metadata = { title: DISPUTES_COPY.title }

const actions = { saveText: saveDisputeTextAction, createUpload: createDisputeUploadAction, attach: attachDisputeFileAction, submit: submitDisputeAction }

export default async function AdminDisputePage({ searchParams }: PageProps<'/[locale]/admin/disputes/view'>) {
  await requireAdmin()
  const { id } = await searchParams
  if (typeof id !== 'string') notFound()
  const db = createAdminSupabase()
  const found = await loadDisputeRow(db, id).catch(() => null)
  if (!found) notFound()
  const live = await loadLiveDispute(stripeClient(), found.stripe_dispute_id).catch((error: unknown) => {
    logger.warn('admin.disputes.live_failed', { dispute_id: found.stripe_dispute_id, error })
    return null
  })
  // A submission Stripe has and our row lacks is recorded now (T82).
  const row = await reconcileSubmitted(db, found, live)
  const mode = serverEnv().VERCEL_ENV === 'production' ? '' : 'test/'
  const stripeUrl = `https://dashboard.stripe.com/${mode}disputes/${row.stripe_dispute_id}`
  return (
    <AdminPage title={DISPUTES_COPY.title}>
      <DisputeDetail row={row} live={live} now={new Date()} stripeUrl={stripeUrl} actions={actions} />
    </AdminPage>
  )
}
