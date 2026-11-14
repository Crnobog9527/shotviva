import { redirect } from 'next/navigation'

import { requireAdmin } from '@/core/auth'
import { INQUIRY_PARAM, withRecord } from '@/core/admin/shell/record-dialog-url'

export const instant = false

// Old inquiry address (alerts, bookmarks): an inquiry now opens as a dialog over the list, so this
// lands there with the dialog open. The id is checked by the dialog's read.
export default async function AdminInquiryPage({ params }: PageProps<'/[locale]/admin/inquiries/[id]'>) {
  await requireAdmin()
  const { id } = await params
  redirect(withRecord('/admin/inquiries', INQUIRY_PARAM, id))
}
