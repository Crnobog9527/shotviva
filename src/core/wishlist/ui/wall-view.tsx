'use client'

import { Link } from '../../i18n/ui'
import { useTranslations } from 'next-intl'

import { buttonVariants } from '../../ui/button'
import type { Page, WallCard as WallCardData } from '../types'
import { RequestBar } from './request-bar'
import { ShowMore } from './show-more'
import { usePaged, type LoadPage } from './use-paged'
import { WallCard } from './wall-card'

type Props = { first: Page<WallCardData>; eligible: boolean; loadMore: LoadPage<WallCardData> }

// The wall (DESIGN §4.7, ARCHITECTURE §15.1): shipped first, then by votes; empty is fine,
// there is no seeded content.
export function WallView({ first, eligible, loadMore }: Props) {
  const wall = usePaged(first, loadMore)
  return (
    <>
      {wall.items.length === 0 ? (
        <WallEmpty eligible={eligible} />
      ) : (
        <div className="grid gap-3 px-4 pt-4">
          {wall.items.map((card) => (
            <WallCard
              key={card.id}
              card={card}
              canVote={eligible}
              onVote={(result) => wall.update(card.id, (item) => ({ ...item, voted: result.voted, votesCount: result.votesCount }))}
            />
          ))}
        </div>
      )}
      <ShowMore hasMore={wall.hasMore} loading={wall.loading} failed={wall.failed} onMore={wall.more} />
      <RequestBar eligible={eligible} />
    </>
  )
}

// "Tell us what template you need" and the post button (DESIGN §4.7). The bottom bar stays
// the one filled primary, so this one is the quiet glass button.
function WallEmpty({ eligible }: { eligible: boolean }) {
  const t = useTranslations('app.wishlist')
  return (
    <div className="grid justify-items-center gap-4 px-6 pt-16 text-center">
      <p className="font-display text-h1 leading-tight">{t('empty')}</p>
      {eligible && (
        <Link href="/wishlist/new" className={buttonVariants({ variant: 'glass', size: 'touch' })}>
          {t('request')}
        </Link>
      )}
    </div>
  )
}
