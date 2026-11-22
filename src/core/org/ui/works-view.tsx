import { Download } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '@/core/i18n/ui'

import type { OrgWorksPage } from '../works'
import { DeleteOrgWork } from './works-delete'

const fileHref = (id: string, query = '') => `/api/account/enterprise/works/${id}${query}`

// "4:5" → "4 / 5" for aspect-ratio; anything else falls back to the usual portrait frame.
function ratio(value: string | null): string {
  const match = value?.match(/^(\d{1,2}):(\d{1,2})$/)
  return match ? `${match[1]} / ${match[2]}` : '4 / 5'
}

type Work = OrgWorksPage['works'][number]
// The page's delete action; the tile binds it to its work.
export type DeleteOrgWorkById = (jobId: string) => Promise<{ failed: 'running' | 'error' } | undefined>

function WorkTile({ work, remove }: { work: Work; remove: DeleteOrgWorkById | null }) {
  const t = useTranslations('app.org.works')
  const format = useFormatter()
  const who = work.userId ? (work.label ?? t('unknown')) : t('deletedAccounts')
  return (
    <li className="min-w-0">
      <a href={fileHref(work.id)} target="_blank" rel="noopener" aria-label={t('open')} className="block overflow-hidden rounded-inner bg-wash shadow-[inset_0_0_0_1px_var(--border)]">
        {/* A signed R2 redirect per request: next/image cannot cache it, and must not. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileHref(work.id, '?size=thumb')} alt={work.templateName ?? ''} loading="lazy" decoding="async" className="w-full object-cover" style={{ aspectRatio: ratio(work.aspectRatio) }} />
      </a>
      <div className="mt-1.5 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-medium">{work.templateName ?? work.templateId}</p>
          <p className="truncate text-caption text-muted-foreground">
            {t('madeBy', { who, date: format.dateTime(new Date(work.createdAt), { dateStyle: 'medium' }) })}
            {work.memberActive || !work.userId ? null : ` · ${t('removed')}`}
          </p>
        </div>
        {remove ? <DeleteOrgWork action={remove.bind(null, work.id)} name={work.templateName ?? work.templateId} /> : null}
        <a href={fileHref(work.id, '?download=1')} aria-label={t('download')} className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-bone-dim hover:bg-wash hover:text-foreground">
          <Download aria-hidden strokeWidth={1.75} className="size-[18px]" />
        </a>
      </div>
    </li>
  )
}

// 企业作品 (ARCHITECTURE §6.5): the org's works, newest first, two across on a phone. "Older" moves
// the (created_at, id) cursor; the member filter stays. `remove` is the owner's delete; staff
// (null) view and download only.
export function OrgWorksView({ page, remove }: { page: OrgWorksPage; remove: DeleteOrgWorkById | null }) {
  const t = useTranslations('app.org.works')
  if (page.works.length === 0) {
    return <p className="hairline-lit rounded-panel bg-card p-4 text-label text-muted-foreground">{t(page.member ? 'emptyMember' : 'empty')}</p>
  }
  const nextHref = page.next ? `/account/enterprise/works?${new URLSearchParams({ ...(page.member ? { member: page.member } : {}), before: page.next })}` : null
  return (
    <section aria-label={t('title')} className="space-y-4">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 xl:grid-cols-4">
        {page.works.map((work) => <WorkTile key={work.id} work={work} remove={remove} />)}
      </ul>
      {nextHref ? (
        <Link href={nextHref} className="flex min-h-11 items-center justify-center rounded-control bg-wash text-label font-semibold shadow-[inset_0_0_0_1px_var(--border)] hover:text-foreground">
          {t('more')}
        </Link>
      ) : null}
    </section>
  )
}
