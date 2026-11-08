import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AdminPage } from '@/core/admin'
import { INQUIRIES_COPY, InquiryDetailView } from '@/core/admin/inquiries-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { loadAdminInquiry } from '@/core/inquiries'

import { saveInquiryAction } from '../actions'

export const instant = false

export const metadata: Metadata = { title: INQUIRIES_COPY.detailTitle }

// One inquiry by primary key, every field, and the follow-up form.
export default async function AdminInquiryPage({ params }: PageProps<'/[locale]/admin/inquiries/[id]'>) {
  await requireAdmin()
  const { id } = await params
  const inquiry = await loadAdminInquiry(createAdminSupabase(), id)
  if (!inquiry) notFound()
  return (
    <AdminPage title={INQUIRIES_COPY.detailTitle}>
      <InquiryDetailView inquiry={inquiry} actions={{ save: saveInquiryAction }} />
    </AdminPage>
  )
}
