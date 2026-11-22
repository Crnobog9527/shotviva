import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getFormatter, getTranslations } from 'next-intl/server'
import { connection } from 'next/server'
import { Suspense } from 'react'

import { AppPage, FlowNav } from '@/core/app-shell'
import { createAdminSupabase, requireUser } from '@/core/auth'
import { Link } from '@/core/i18n/ui'
import { localized } from '@/core/i18n/server'
import { thumbUrlFor } from '@/core/jobs'
import { listWorkShares, OWN_SHARES_PAGE, type OwnShare } from '@/core/work-share'
import { OwnShares, type OwnShareRow } from '@/modules/image/share-links'

import { revokeWorkShareAction } from '../share-actions'
import { parseBefore, beforeParam } from './cursor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.workShare'))('listMeta') }
}

function Nav() {
  const t = useTranslations('app.workShare')
  return <FlowNav back={{ href: '/photos', label: t('listBack') }} title={t('listTitle')} pinnedTitle />
}

async function rowsOf(shares: OwnShare[]): Promise<OwnShareRow[]> {
  const [t, format] = await Promise.all([getTranslations('app.workShare'), getFormatter()])
  return Promise.all(
    shares.map(async (share) => ({
      id: share.id,
      title: share.title,
      meta: t('rowMeta', { when: format.dateTime(share.createdAt, { year: 'numeric', month: 'short', day: 'numeric' }), count: share.works, before: share.showBefore ? 'yes' : 'no' }),
      path: await localized(`/s/w/${share.id}`),
      thumbUrl: share.coverJobId ? thumbUrlFor(share.coverJobId) : null,
      revoked: share.revokedAt !== null,
    })),
  )
}

// Share links (ARCHITECTURE §6.2「作品集分享」), a flow page under Photos: the owner's links,
// newest first, 30 at a time (?before= is the last row's cursor).
async function Shares({ searchParams }: { searchParams: PageProps<'/[locale]/photos/shares'>['searchParams'] }) {
  const user = await requireUser('/photos/shares')
  await connection()
  const t = await getTranslations('app.workShare')
  const shares = await listWorkShares(createAdminSupabase(), user.id, parseBefore((await searchParams).before))
  const last = shares.length === OWN_SHARES_PAGE ? shares.at(-1) : undefined
  return (
    <>
      <p className="mx-(--gutter) mt-2 max-w-[60ch] text-label text-muted-foreground">{t('listLede')}</p>
      <OwnShares rows={await rowsOf(shares)} revoke={revokeWorkShareAction} />
      {last ? (
        <Link href={`/photos/shares?before=${beforeParam(last)}`} prefetch={false} className="mx-(--gutter) mt-4 inline-flex min-h-11 items-center text-label font-medium underline underline-offset-4">
          {t('more')}
        </Link>
      ) : null}
    </>
  )
}

export default function ShareLinksPage({ searchParams }: PageProps<'/[locale]/photos/shares'>) {
  return (
    <AppPage wide>
      <Nav />
      <Suspense>
        <Shares searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
