import type { Metadata } from 'next'
import { Suspense } from 'react'

import { AnalyticsIdentify } from '@/core/analytics/browser'
import { getSessionUser } from '@/core/auth'
import { appShellMetadata } from '@/core/seo'

// Every logged-in page is noindex through this one layout, never per page (AGENTS §9).
// The app shell UI itself lands with T8; every page inside calls requireUser() itself.
export const metadata: Metadata = appShellMetadata()

// Same cached session lookup the page's requireUser() makes, so no extra auth round trip.
async function Identity() {
  const user = await getSessionUser()
  return user ? <AnalyticsIdentify userId={user.id} /> : null
}

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col">
      <Suspense fallback={null}>
        <Identity />
      </Suspense>
      {children}
    </main>
  )
}
