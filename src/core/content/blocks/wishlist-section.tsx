import type { ReactNode } from 'react'

import type { WishlistPromo } from '../page-content'

// Right under the template grid (Owner 2026-11-10), one line since 2026-11-24 to keep the phone
// page short: the question for the visitor whose niche the grid does not cover, and the one
// ghost CTA, a request-time slot (signed in or not) so the line stays static.
export function WishlistLine({ block, cta }: { block: WishlistPromo; cta: ReactNode }) {
  return (
    <div className="mk-wish-line mk-reveal" id="wishlist">
      <p>{`${block.heading.lead}${block.heading.emphasis}${block.heading.tail}`}</p>
      {cta}
    </div>
  )
}
