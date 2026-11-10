'use client'

import type { Page, WallCard as WallCardData } from '../types'
import { RequestBar } from './request-bar'
import { ShowMore } from './show-more'
import { useBreeze } from './use-breeze'
import { usePaged, type LoadPage } from './use-paged'
import { WallCard } from './wall-card'
import { WallEmpty } from './wishlist-state'

// `now` comes from the server render, so "3 days ago" reads the same before and after hydration.
type Props = { first: Page<WallCardData>; eligible: boolean; now: string; loadMore: LoadPage<WallCardData> }

// The wall (B comp wishlist.html, ARCHITECTURE §15.1): shipped first, then by votes. The one
// primary sits under the lede on desktop and fixed above the tab bar on phones. Empty is fine:
// there is no seeded content, and the empty plate carries the primary itself.
export function WallView({ first, eligible, now, loadMore }: Props) {
  const wall = usePaged(first, loadMore)
  const wallRef = useBreeze()
  const at = new Date(now)
  if (wall.items.length === 0) return <WallEmpty eligible={eligible} />
  return (
    <div className="flex flex-col">
      <ul ref={wallRef} className="wl-wall">
        {wall.items.map((card) => (
          <li key={card.id}>
            <WallCard
              card={card}
              canVote={eligible}
              now={at}
              onVote={(result) => wall.update(card.id, (item) => ({ ...item, voted: result.voted, votesCount: result.votesCount }))}
            />
          </li>
        ))}
      </ul>
      <div className="pt-6">
        <ShowMore hasMore={wall.hasMore} loading={wall.loading} failed={wall.failed} onMore={wall.more} />
      </div>
      <RequestBar eligible={eligible} />
    </div>
  )
}
