'use client'

import { useEffect, useState } from 'react'

import type { Page, WallCard as WallCardData } from '../types'
import { RequestBar } from './request-bar'
import { ShowMore } from './show-more'
import { useBreeze } from './use-breeze'
import { usePaged, type LoadPage } from './use-paged'
import { WallCard } from './wall-card'
import { WallEmpty } from './wishlist-state'

// `now` comes from the server render, so "3 days ago" reads the same before and after hydration.
// The viewer's own part is either known (`eligible`) or streamed after the wall (`personal`: their
// votes among the first page and whether they may post and vote, Owner 2026-11-24); until it
// lands, voting and the post button wait.
export type WallPersonal = { voted: string[]; eligible: boolean }
type Props = { first: Page<WallCardData>; now: string; loadMore: LoadPage<WallCardData>; eligible?: boolean; personal?: Promise<WallPersonal> }

// The wall (B comp wishlist.html, ARCHITECTURE §15.1): shipped first, then by votes. The one
// primary sits under the lede on desktop and fixed above the tab bar on phones. Empty is fine:
// there is no seeded content, and the empty plate carries the primary itself.
export function WallView({ first, eligible: given, personal, now, loadMore }: Props) {
  const wall = usePaged(first, loadMore)
  const eligible = useViewer(personal, given, wall.update)
  const wallRef = useBreeze()
  const at = new Date(now)
  if (wall.items.length === 0) return <WallEmpty eligible={eligible === true} />
  return (
    <div className="flex flex-col">
      <ul ref={wallRef} className="wl-wall">
        {wall.items.map((card) => (
          <li key={card.id}>
            <WallCard
              card={card}
              canVote={eligible === true}
              now={at}
              onVote={(result) => wall.update(card.id, (item) => ({ ...item, voted: result.voted, votesCount: result.votesCount }))}
            />
          </li>
        ))}
      </ul>
      <div className="pt-6">
        <ShowMore hasMore={wall.hasMore} loading={wall.loading} failed={wall.failed} onMore={wall.more} />
      </div>
      {eligible === null ? null : <RequestBar eligible={eligible} />}
    </div>
  )
}

// Whether the viewer may vote and post: given, or null until the streamed part lands, which also
// marks their own votes on the first page.
function useViewer(personal: Promise<WallPersonal> | undefined, given: boolean | undefined, update: ReturnType<typeof usePaged<WallCardData>>['update']): boolean | null {
  const [eligible, setEligible] = useState<boolean | null>(given ?? null)
  useEffect(() => {
    if (!personal) return
    let live = true
    personal.then(({ voted, eligible: may }) => {
      if (!live) return
      for (const id of voted) update(id, (item) => ({ ...item, voted: true }))
      setEligible(may)
    }, () => undefined)
    return () => {
      live = false
    }
  }, [personal, update])
  return eligible
}
