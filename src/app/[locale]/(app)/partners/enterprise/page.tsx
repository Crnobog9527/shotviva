import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import type { SearchParams } from '@/core/affiliate/partners'
// Straight from its file, never through the partners index: public /partners pages import that
// index, and Tailwind's public sheet is built from every file they can reach (css:sources).
import { EnterpriseScreen } from '@/core/affiliate/partners/enterprise'
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
