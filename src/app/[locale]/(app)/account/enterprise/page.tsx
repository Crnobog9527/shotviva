import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { readOwnerReport } from '@/core/org/console'
import { BillingProfilePanel, EnterpriseFrame, OwnerConsoleView, type OwnerActions } from '@/core/org/ui'

import {
  allocateAction, allocatePromoAction, bulkGrantAction, bulkSetAllowanceAction, depositAction, removeMemberAction, resetInviteAction, setAllowanceAction,
  setDefaultsAction, setPromoAllowanceAction,
} from '../org-actions'
import { billingActions, readBilling } from './billing'
import { readOwnerArea } from './owner-area'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.tabs'))('console') }
}

const actions: OwnerActions = {
  deposit: depositAction,
  allocate: allocateAction,
  setAllowance: setAllowanceAction,
  allocatePromo: allocatePromoAction,
  setPromoAllowance: setPromoAllowanceAction,
  setDefaults: setDefaultsAction,
  bulkSetAllowance: bulkSetAllowanceAction,
  bulkGrant: bulkGrantAction,
  removeMember: removeMemberAction,
  resetInvite: resetInviteAction,
}

// /account/enterprise: 「企业工作台」, the org owner's workspace (ARCHITECTURE §6.5, card E4).
async function Workspace({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const [{ user, db, view, affiliate }, t, { month }] = await Promise.all([readOwnerArea('/account/enterprise'), getTranslations('app.org.area'), searchParams])
  const [report, billing] = await Promise.all([
    readOwnerReport({ db, user: user.id, console: view, month: Array.isArray(month) ? month[0] : month, maskPhone }),
    readBilling(db, user.id),
  ])
  return (
    <EnterpriseFrame orgName={view.org.name} current="workspace" affiliate={affiliate} intro={t('workspaceIntro')}>
      <OwnerConsoleView data={view} actions={actions} report={report} affiliate={affiliate} />
      <BillingProfilePanel profile={billing.profile} unavailable={billing.unavailable} actions={billingActions} />
    </EnterpriseFrame>
  )
}

export default function EnterprisePage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <Workspace searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
