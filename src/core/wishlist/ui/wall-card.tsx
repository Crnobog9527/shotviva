'use client'

import { Link } from '../../i18n/ui'
import { useTranslations } from 'next-intl'

import type { VoteResult, WallCard as WallCardData } from '../types'
import { ImageStrip } from './image-strip'
import { VoteButton } from './vote-button'

type Props = { card: WallCardData; canVote: boolean; onVote(result: VoteResult): void }

// One request on the wall (DESIGN §4.7): reference photos, the description, the masked author
// and "I want this too". A shipped card opens with a "Shipped →" strip into its template.
export function WallCard({ card, canVote, onVote }: Props) {
  const t = useTranslations('app.wishlist')
  return (
    <article className="hairline-lit overflow-hidden rounded-panel bg-card">
      {card.template && (
        <Link
          href={`/generate/${card.template.id}`}
          className="press flex min-h-11 items-center justify-between gap-3 bg-wash px-4 py-2 text-caption font-semibold"
        >
          <span className="text-primary">{t('shipped')}</span>
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{card.template.name}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </Link>
      )}
      <div className="grid gap-3 p-3">
        <ImageStrip urls={card.imageUrls} />
        <p className="px-1 text-body leading-[1.45] break-words">{card.description}</p>
        <div className="flex items-end justify-between gap-3 px-1">
          <span className="pb-3 text-caption text-muted-foreground">{t('by', { name: card.authorLabel })}</span>
          {card.status === 'live' && (
            <VoteButton requestId={card.id} voted={card.voted} count={card.votesCount} enabled={canVote} onResult={onVote} />
          )}
        </div>
      </div>
    </article>
  )
}
