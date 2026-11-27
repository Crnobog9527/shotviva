import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { EnterpriseFrame, PurchasingView } from '@/core/org/ui'
import { site } from '@/site/site.config'

import { readOwnerArea } from '../owner-area'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.tabs'))('purchasing') }
}

// /account/enterprise/purchasing: 「企业集采信息」, package prices and bank transfer details
// (Owner 2026-11-22: moved out of the workspace).
async function Purchasing() {
  const [{ view, affiliate }, t] = await Promise.all([readOwnerArea('/account/enterprise/purchasing'), getTranslations('app.org.area')])
  return (
    <EnterpriseFrame orgName={view.org.name} current="purchasing" affiliate={affiliate} intro={t('purchasingIntro')}>
      <PurchasingView data={view} contact={site.enterprise?.transferContact} />
    </EnterpriseFrame>
  )
}

export default function PurchasingPage() {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <Purchasing />
      </Suspense>
    </AppPage>
  )
}
