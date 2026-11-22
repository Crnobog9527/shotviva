import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { readOrgWorksPage } from '@/core/org/works'
import { EnterpriseFrame, OrgWorksView, WorksMemberFilter } from '@/core/org/ui'

import { readOwnerArea } from '../owner-area'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.tabs'))('works') }
}

type Search = Promise<{ member?: string | string[]; before?: string | string[] }>
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

// /account/enterprise/works: 「企业作品」, everything the org's credits paid for, by member,
// removed members included (Owner 2026-11-22). Owner only, like the rest of the area.
async function Works({ searchParams }: { searchParams: Search }) {
  const [{ user, db, view, affiliate }, t, query] = await Promise.all([readOwnerArea('/account/enterprise/works'), getTranslations('app.org.area'), searchParams])
  const page = await readOrgWorksPage(db, user.id, { member: one(query.member), before: one(query.before) }, maskPhone)
  return (
    <EnterpriseFrame orgName={view.org.name} current="works" affiliate={affiliate} intro={t('worksIntro')} subnav={<WorksMemberFilter page={page} />}>
      <OrgWorksView page={page} />
    </EnterpriseFrame>
  )
}

export default function OrgWorksPage({ searchParams }: { searchParams: Search }) {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <Works searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
