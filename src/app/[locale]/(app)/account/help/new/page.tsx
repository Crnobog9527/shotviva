import { redirect } from 'next/navigation'

import { localized } from '@/core/i18n/server'
import { legacyHelpTarget } from '@/core/support/ui'

// The old New request page: a deep link to the dialog's New ticket tab (T68).
export default async function NewTicketPage() {
  redirect(await localized(legacyHelpTarget('new')))
}
