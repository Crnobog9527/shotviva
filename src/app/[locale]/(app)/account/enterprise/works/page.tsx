import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'

import { AppPage } from '@/core/app-shell'
import { maskPhone } from '@/core/auth/phone'
import { readOrgWorksPage } from '@/core/org/works'
import { EnterpriseFrame, OrgWorksView, WorksMemberFilter } from '@/core/org/ui'

import { readEnterpriseArea } from '../owner-area'
import { deleteOrgWorkAction } from './actions'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.org.tabs'))('works') }
}

type Search = Promise<{ member?: string | string[]; before?: string | string[] }>
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

// /account/enterprise/works: 「企业作品」, everything the org's credits paid for, by member,
// removed members included (Owner 2026-11-22). Every active member of the org sees it, the owner
// and the staff alike (Owner 2026-11-23); only the owner gets the delete button, and the delete
// action checks ownership again. Anyone outside an org gets the 404.
async function Works({ searchParams }: { searchParams: Search }) {
  const [area, t, query] = await Promise.all([readEnterpriseArea('/account/enterprise/works'), getTranslations('app.org.area'), searchParams])
  const page = await readOrgWorksPage(area.db, area.user.id, { member: one(query.member), before: one(query.before) }, maskPhone)
  const owner = area.kind === 'owner'
  return (
    <EnterpriseFrame
      orgName={owner ? area.view.org.name : area.view.orgName}
      current="works"
      affiliate={owner ? area.affiliate : area.view.withAffiliate}
      role={area.kind}
      intro={t(owner ? 'worksIntro' : 'worksIntroMember')}
      subnav={<WorksMemberFilter page={page} />}
    >
      <OrgWorksView page={page} remove={owner ? deleteOrgWorkAction : null} />
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
