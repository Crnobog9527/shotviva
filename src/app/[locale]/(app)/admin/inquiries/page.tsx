import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AdminPage } from '@/core/admin'
import { INQUIRIES_COPY, InquiriesView, InquiryDialogHost } from '@/core/admin/inquiries-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { inquiryFilterSchema, listAdminInquiries } from '@/core/inquiries'

import { inquiryDetailAction, saveInquiryAction } from './actions'

// Admin-only, request-time page (ARCHITECTURE §10.c, T86): business inquiries, newest first,
// filtered by status. The proxy answers non-admins with a 404; requireAdmin() is the real check.
// An inquiry opens in a dialog over the list (?inquiry=<id>).
export const instant = false

export const metadata: Metadata = { title: INQUIRIES_COPY.title }

const inquiryActions = { save: saveInquiryAction }

export default async function AdminInquiriesPage({ searchParams }: PageProps<'/[locale]/admin/inquiries'>) {
  await requireAdmin()
  const params = await searchParams
  const filter = inquiryFilterSchema.parse({ status: params.status })
  const cursor = typeof params.cursor === 'string' ? params.cursor : null
  const page = await listAdminInquiries(createAdminSupabase(), filter, cursor)
  return (
    <AdminPage title={INQUIRIES_COPY.title}>
      <InquiriesView filter={filter} page={page} paged={cursor !== null} />
      <Suspense>
        <InquiryDialogHost load={inquiryDetailAction} actions={inquiryActions} />
      </Suspense>
    </AdminPage>
  )
}
