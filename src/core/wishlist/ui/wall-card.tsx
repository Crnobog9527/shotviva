'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '../../i18n/ui'
import type { VoteResult, WallCard as WallCardData } from '../types'
import { ChevronIcon } from './icons'
import { ImageStrip } from './image-strip'
import { VoteButton, VoteCount } from './vote-button'

// `demo`: the teaching sheet's example (guide-demo.tsx), drawn inert; its made-up template is
// never prefetched.
type Props = { card: WallCardData; canVote: boolean; now: Date; onVote(result: VoteResult): void; demo?: boolean }

// One request on the wall (B comp wishlist.html .req): a print taped to the wall with its
// reference photos, the note in the hand of the serif, the masked author and when, and the vote.
// A shipped request gets the "Shipped" stamp and links into its template (ARCHITECTURE §15.1).
export function WallCard({ card, canVote, now, onVote, demo = false }: Props) {
  const t = useTranslations('app.wishlist')
  const format = useFormatter()
  return (
    <article className="wl-req">
      {card.template && (
        <span className="wl-stamp" aria-hidden="true">
          {t('shipped')}
        </span>
      )}
      <ImageStrip urls={card.imageUrls} />
      <div className="grid min-w-0 gap-2 px-1 pt-2.5">
        <p className="wl-text">{card.description}</p>
        {card.template && (
          <Link
            href={`/generate/${card.template.id}`}
            prefetch={demo ? false : undefined}
            className="press flex min-h-9 items-center justify-between gap-2 text-label font-medium text-success hover:underline hover:underline-offset-3"
          >
            <span className="min-w-0">{t.rich('nowTemplate', { name: card.template.name, b: (chunks) => <b className="font-semibold">{chunks}</b> })}</span>
            <ChevronIcon />
          </Link>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-muted-foreground">
            {t('byline', { name: card.authorLabel, when: format.relativeTime(new Date(card.createdAt), now) })}
          </span>
          {card.status === 'live' ? (
            <VoteButton requestId={card.id} voted={card.voted} count={card.votesCount} enabled={canVote} onResult={onVote} />
          ) : (
            <VoteCount count={card.votesCount} />
          )}
        </div>
      </div>
    </article>
  )
}
