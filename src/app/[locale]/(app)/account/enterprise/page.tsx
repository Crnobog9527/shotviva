import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { readOwnerReport, type StaffCard } from '@/core/org/console'
import { BillingProfilePanel, EnterpriseFrame, MemberOrgView, OwnerConsoleView, type OwnerActions } from '@/core/org/ui'

import {
  allocateAction, allocatePromoAction, bulkGrantAction, bulkSetAllowanceAction, depositAction, poolsAction,
  removeMemberAction, resetInviteAction, setAllowanceAction,
  setDefaultsAction, setPromoAllowanceAction,
} from '../org-actions'
import { billingActions, readBilling } from './billing'
import { readEnterpriseArea } from './owner-area'

const PATH = '/account/enterprise'

export async function generateMetadata(): Promise<Metadata> {
  const area = await readEnterpriseArea(PATH)
  if (area.kind === 'member') return { title: (await getTranslations('app.org.staff'))('metaTitle') }
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
  pools: poolsAction,
  removeMember: removeMemberAction,
  resetInvite: resetInviteAction,
}

// /account/enterprise: 「企业工作台」, the org owner's workspace (ARCHITECTURE §6.5, card E4), or
// for a member their own view of the org (Owner 2026-11-23), opened from 「企业」 on /account.
async function Workspace({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const [area, { month }] = await Promise.all([readEnterpriseArea(PATH), searchParams])
  if (area.kind === 'member') return <MemberArea data={area.view} />
  const { user, db, view, affiliate } = area
  const [report, billing, t] = await Promise.all([
    readOwnerReport({ db, user: user.id, console: view, month: Array.isArray(month) ? month[0] : month, maskPhone }),
    readBilling(db, user.id),
    getTranslations('app.org.area'),
  ])
  return (
    <EnterpriseFrame orgName={view.org.name} current="workspace" affiliate={affiliate} intro={t('workspaceIntro')}>
      <OwnerConsoleView data={view} actions={actions} report={report} affiliate={affiliate} />
      <BillingProfilePanel profile={billing.profile} unavailable={billing.unavailable} actions={billingActions} />
    </EnterpriseFrame>
  )
}

// A member's page: their own numbers only, with 企业作品 next to it in the member's navigation.
async function MemberArea({ data }: { data: StaffCard }) {
  const t = await getTranslations('app.org.staff')
  return (
    <EnterpriseFrame orgName={data.orgName} current="workspace" affiliate={false} role="member" intro={t('pageIntro')}>
      <MemberOrgView data={data} />
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
