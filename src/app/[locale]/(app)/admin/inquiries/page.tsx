import type { Metadata } from 'next'

import { AdminPage } from '@/core/admin'
import { INQUIRIES_COPY, InquiriesView } from '@/core/admin/inquiries-ui'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { inquiryFilterSchema, listAdminInquiries } from '@/core/inquiries'

// Admin-only, request-time page (ARCHITECTURE §10.c, T86): business inquiries, newest first,
// filtered by status. The proxy answers non-admins with a 404; requireAdmin() is the real check.
export const instant = false

export const metadata: Metadata = { title: INQUIRIES_COPY.title }

export default async function AdminInquiriesPage({ searchParams }: PageProps<'/[locale]/admin/inquiries'>) {
  await requireAdmin()
  const params = await searchParams
  const filter = inquiryFilterSchema.parse({ status: params.status })
  const cursor = typeof params.cursor === 'string' ? params.cursor : null
  const page = await listAdminInquiries(createAdminSupabase(), filter, cursor)
  return (
    <AdminPage title={INQUIRIES_COPY.title}>
      <InquiriesView filter={filter} page={page} paged={cursor !== null} />
    </AdminPage>
  )
}
