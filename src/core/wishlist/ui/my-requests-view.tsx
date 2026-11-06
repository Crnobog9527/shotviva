'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'

import { cn } from '../../ui/cn'
import { EmptyState, STATE_GHOST } from '../../ui/empty-state'
import type { MyRequest, Page, RequestStatus } from '../types'
import { ImageStrip } from './image-strip'
import { ShowMore } from './show-more'
import { usePaged, type LoadPage } from './use-paged'

// Safelight marks the live and shipped states only; pending and rejected stay neutral.
const TONE: Record<RequestStatus, string> = {
  pending: 'bg-wash text-muted-foreground',
  live: 'bg-wash text-primary',
  shipped: 'bg-primary text-primary-foreground',
  rejected: 'bg-wash text-muted-foreground',
}

// My requests (DESIGN §4.7): every request of mine with its state. Rejected shows no reason
// and, its photos deleted, no images (ARCHITECTURE §15.1, §15.4).
export function MyRequestsView({ first, loadMore }: { first: Page<MyRequest>; loadMore: LoadPage<MyRequest> }) {
  const t = useTranslations('app.wishlist')
  const list = usePaged(first, loadMore)
  if (list.items.length === 0) {
    const toWall = (
      <Link href="/wishlist" className={STATE_GHOST}>
        {t('mine.toWall')}
      </Link>
    )
    return <EmptyState icon="heart" title={t('mine.empty')} body={t('mine.emptyBody')} action={toWall} />
  }
  return (
    <>
      <div className="grid gap-3 px-4 pt-4">
        {list.items.map((request) => (
          <MyRequestCard key={request.id} request={request} />
        ))}
      </div>
      <ShowMore hasMore={list.hasMore} loading={list.loading} failed={list.failed} onMore={list.more} />
    </>
  )
}

function MyRequestCard({ request }: { request: MyRequest }) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  return (
    <article className="hairline-lit grid gap-3 rounded-panel bg-card p-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <span className={cn('inline-flex min-h-7 items-center rounded-full px-3 text-caption font-semibold', TONE[request.status])}>
          {t(`mine.status.${request.status}`)}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          {format.dateTime(new Date(request.createdAt), { dateStyle: 'medium' })}
        </span>
      </div>
      <ImageStrip urls={request.imageUrls} />
      <p className="px-1 text-body leading-[1.45] break-words">{request.description}</p>
      {(request.status === 'live' || request.status === 'shipped') && (
        <p className="px-1 text-caption text-muted-foreground">{t('mine.votes', { count: request.votesCount })}</p>
      )}
    </article>
  )
}
