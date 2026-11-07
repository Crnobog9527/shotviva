import { redirect } from 'next/navigation'

import { localized } from '@/core/i18n/server'
import { legacyHelpTarget } from '@/core/support/ui'

// Help & feedback lives in a dialog on /account now (ARCHITECTURE §10 「在弹窗里完成」, T68);
// this address stays as a deep link to My tickets. The proxy has already sent signed-out
// visitors to the login page, which brings them back here.
export default async function HelpPage() {
  redirect(await localized(legacyHelpTarget()))
}
