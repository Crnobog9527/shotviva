import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { EnterpriseScreen } from '@/core/affiliate/partners'
import type { SearchParams } from '@/core/affiliate/partners'
import { AppPage } from '@/core/app-shell'
// The dashboard panels' sheet. This page lives in the app group (Owner 2026-11-22: one frame for
// the whole enterprise area), while the rest of /partners stays a marketing page.
import '../../../(marketing)/partners/partners.css'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.tabs'))('affiliate') }
}

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <EnterpriseScreen search={searchParams} />
      </Suspense>
    </AppPage>
  )
}
