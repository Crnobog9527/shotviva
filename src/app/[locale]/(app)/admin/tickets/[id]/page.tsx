import { redirect } from 'next/navigation'

import { requireAdmin } from '@/core/auth'
import { TICKET_PARAM, withRecord } from '@/core/admin/shell/record-dialog-url'

export const instant = false

// Old ticket address (Feishu alerts, bookmarks): a ticket now opens as a dialog over the list, so
// this lands there with the dialog open. The id is checked by the dialog's read.
export default async function AdminTicketPage({ params }: PageProps<'/[locale]/admin/tickets/[id]'>) {
  await requireAdmin()
  const { id } = await params
  redirect(withRecord('/admin/tickets', TICKET_PARAM, id))
}
