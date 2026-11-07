import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage, DISPUTES_COPY, DisputeDetail } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { loadDisputeRow, loadLiveDispute, stripeClient } from '@/core/billing/stripe'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

import { attachDisputeFileAction, createDisputeUploadAction, saveDisputeTextAction, submitDisputeAction } from '../actions'

// /admin/disputes/[id] (T82): our row, and the draft as Stripe holds it now.
export const instant = false

export const metadata: Metadata = { title: DISPUTES_COPY.title }

const actions = { saveText: saveDisputeTextAction, createUpload: createDisputeUploadAction, attach: attachDisputeFileAction, submit: submitDisputeAction }

export default async function AdminDisputePage({ params }: PageProps<'/[locale]/admin/disputes/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const row = await loadDisputeRow(createAdminSupabase(), id).catch(() => null)
  if (!row) notFound()
  const live = await loadLiveDispute(stripeClient(), row.stripe_dispute_id).catch((error: unknown) => {
    logger.warn('admin.disputes.live_failed', { dispute_id: row.stripe_dispute_id, error })
    return null
  })
  const mode = serverEnv().VERCEL_ENV === 'production' ? '' : 'test/'
  const stripeUrl = `https://dashboard.stripe.com/${mode}disputes/${row.stripe_dispute_id}`
  return (
    <AdminPage title={DISPUTES_COPY.title}>
      <DisputeDetail row={row} live={live} now={new Date()} stripeUrl={stripeUrl} actions={actions} />
    </AdminPage>
  )
}
