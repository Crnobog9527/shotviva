'use client'

/* eslint-disable @next/next/no-img-element -- short-lived signed R2 URLs, not optimisable */
import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { MyRequest, Page } from '../types'
import { ChevronIcon } from './icons'
import { ShowMore } from './show-more'
import { usePaged, type LoadPage } from './use-paged'
import { MineEmpty } from './wishlist-state'

type Props = { first: Page<MyRequest>; now: string; loadMore: LoadPage<MyRequest> }

// My requests (B comp wishlist.html ?v=mine): one row per request with its first photo, the
// text, the state, when, and votes once it is on the wall. A shipped one opens its template.
// Rejected shows no reason and, its photos deleted, no photo (ARCHITECTURE §15.1, §15.4).
export function MyRequestsView({ first, now, loadMore }: Props) {
  const list = usePaged(first, loadMore)
  const at = new Date(now)
  if (list.items.length === 0) return <MineEmpty />
  return (
    <>
      <ul className="mx-(--gutter) mt-5 grid gap-2 md:mx-auto md:max-w-[720px] md:px-(--gutter)">
        {list.items.map((request) => (
          <li key={request.id}>
            <MyRequestRow request={request} now={at} />
          </li>
        ))}
      </ul>
      <div className="pt-4">
        <ShowMore hasMore={list.hasMore} loading={list.loading} failed={list.failed} onMore={list.more} />
      </div>
    </>
  )
}

const ROW = 'hairline-lit flex items-center gap-3 rounded-panel bg-card p-2.5'

function MyRequestRow({ request, now }: { request: MyRequest; now: Date }) {
  const body = <RowBody request={request} now={now} />
  if (request.status === 'shipped' && request.templateId) {
    return (
      <Link href={`/generate/${request.templateId}`} className={`press ${ROW}`}>
        {body}
        <ChevronIcon className="size-5 flex-none text-bone-dim" />
      </Link>
    )
  }
  return <div className={ROW}>{body}</div>
}

function RowBody({ request, now }: { request: MyRequest; now: Date }) {
  const t = useTranslations('app.wishlist.mine')
  const format = useFormatter()
  const photo = request.imageUrls[0]
  const onWall = request.status === 'live' || request.status === 'shipped'
  return (
    <>
      {photo ? (
        <img src={photo} alt="" loading="lazy" className="h-20 w-16 flex-none rounded-[10px] object-cover" />
      ) : (
        <span aria-hidden="true" className="h-20 w-16 flex-none rounded-[10px] bg-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] leading-[1.4] break-words">{request.description}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <span className="wl-st" data-status={request.status}>
            {t(`status.${request.status}`)}
          </span>
          <span>{format.relativeTime(new Date(request.createdAt), now)}</span>
          {onWall && <span className="font-mono">{t('votes', { count: request.votesCount })}</span>}
        </span>
      </span>
    </>
  )
}
