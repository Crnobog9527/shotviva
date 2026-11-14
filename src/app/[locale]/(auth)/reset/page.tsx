import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EMAIL_LINK_HOURS } from '@/core/auth'

import { resetRequestAction } from '@/app/auth/actions'

import { ResetScreen } from '../auth-screens'
import { sender } from '../sender'

// Sign-in pages are noindex like the rest of the app (建站规格 R6), in both languages, and carry
// no hreflang (ARCHITECTURE §17); the root template adds " | Shotviva" to the title.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth.reset'))('title') }
}

// Static (auth-screens.tsx): the cached HTML carries the form; the browser reads ?error=.
export default function ResetPage() {
  const form = { action: resetRequestAction, linkHours: EMAIL_LINK_HOURS, sender }
  return (
    <ResetScreen {...form} />
  )
}
