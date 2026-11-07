import { redirect } from 'next/navigation'

import { localized } from '@/core/i18n/server'
import { legacyHelpTarget } from '@/core/support/ui'

// The old ticket page: a deep link to that ticket in the dialog (T68). Whose ticket it is is
// checked when the dialog reads it; a malformed id lands on My tickets.
export default async function TicketPage({ params }: PageProps<'/[locale]/account/help/[id]'>) {
  const { id } = await params
  redirect(await localized(legacyHelpTarget(id)))
}
