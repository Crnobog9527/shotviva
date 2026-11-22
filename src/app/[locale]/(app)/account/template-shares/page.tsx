import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'

import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { AppPage } from '@/core/app-shell'
import { createAdminSupabase, createServerSupabase, requireUser } from '@/core/auth'
import { currentLocale } from '@/core/i18n/server'
import { Link } from '@/core/i18n/ui'
import { listTemplateShares, sharerRefSlug, TEMPLATE_SHARES_PAGE, templateShareUrl } from '@/core/template-shares'
import { ShareList, type ShareRow } from '@/modules/image/template-shares-page'

import { cursorOf, cursorParam } from './cursor'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('app.templateShare'))('listTitle') }
}

type Search = Promise<{ before?: string | string[] }>

// /account/template-shares: the signed-in member's template collection share links (ARCHITECTURE
// §5.1g), newest first, 30 a page, read on their own session (RLS: own rows only).
async function TemplateShares({ searchParams }: { searchParams: Search }) {
  const user = await requireUser('/account/template-shares')
  const [{ before }, locale, t, db] = await Promise.all([searchParams, currentLocale(), getTranslations('app.templateShare'), createServerSupabase()])
  const [shares, ref] = await Promise.all([listTemplateShares(db, user.id, cursorOf(before)), sharerRefSlug(createAdminSupabase(), user.id, isAffiliateEnabled)])
  const rows: ShareRow[] = shares.map((share) => ({
    id: share.id, url: templateShareUrl(share.id, locale, ref), title: share.title, count: share.items.length, createdAt: share.createdAt, revoked: share.revokedAt !== null,
  }))
  const last = shares.length === TEMPLATE_SHARES_PAGE ? shares.at(-1) : undefined
  return (
    <>
      <header className="mx-(--gutter) mt-6 space-y-1">
        <Link href="/account" className="inline-flex min-h-11 items-center text-label text-muted-foreground">{t('back')}</Link>
        <h1 className="text-headline font-semibold tracking-[-0.01em]">{t('listTitle')}</h1>
        <p className="text-caption text-muted-foreground">{t('listLede')}</p>
      </header>
      <div className="mx-(--gutter) mt-4 space-y-4 pb-8 md:max-w-[720px]">
        <ShareList rows={rows} />
        {last ? <Link href={`/account/template-shares?before=${cursorParam(last)}`} className="inline-flex min-h-11 items-center text-caption font-medium underline underline-offset-4">{t('older')}</Link> : null}
      </div>
    </>
  )
}

export default function TemplateSharesPage({ searchParams }: { searchParams: Search }) {
  return (
    <AppPage wide>
      <Suspense fallback={null}>
        <TemplateShares searchParams={searchParams} />
      </Suspense>
    </AppPage>
  )
}
