import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { AppPage } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { maskPhone } from '@/core/auth/phone'
import { Link } from '@/core/i18n/ui'
import { readOrgView, readOwnerReport } from '@/core/org/console'
import { OrgTabs, OwnerConsoleView, type OwnerActions } from '@/core/org/ui'

import { allocateAction, depositAction, removeMemberAction, resetInviteAction, setAllowanceAction } from '../org-actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org'))('metaTitle') }
}

const actions: OwnerActions = {
  deposit: depositAction,
  allocate: allocateAction,
  setAllowance: setAllowanceAction,
  removeMember: removeMemberAction,
  resetInvite: resetInviteAction,
}

// /account/enterprise: the org owner's console (ARCHITECTURE §6.5, card E4). Only the account
// that owns an org sees it; a member or anyone else gets the plain 404 (their card is on /account).
async function Enterprise({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const user = await requireUser('/account/enterprise')
  const db = createAdminSupabase()
  const [view, t, affiliateOn, { month }] = await Promise.all([readOrgView(user.id, { db, maskPhone }), getTranslations('app.org'), isAffiliateEnabled(), searchParams])
  if (view.kind !== 'owner') notFound()
  const report = await readOwnerReport({ db, user: user.id, console: view, month: Array.isArray(month) ? month[0] : month, maskPhone })
  return (
    <>
      <header className="mx-(--gutter) mt-6 space-y-1">
        <Link href="/account" className="inline-flex min-h-11 items-center text-label text-muted-foreground">{t('back')}</Link>
        <h1 className="text-headline font-semibold tracking-[-0.01em]">{view.org.name}</h1>
      </header>
      <div className="mx-(--gutter) mt-4 space-y-4 md:max-w-[720px]">
        <OrgTabs current="console" affiliate={view.org.affiliateEnabled && affiliateOn} />
        <OwnerConsoleView data={view} actions={actions} report={report} />
      </div>
    </>
  )
}

export default function EnterprisePage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <Enterprise searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
