import { Suspense } from 'react'

import { WishCta, type WishlistPromo } from '@/core/content'

import { signedIn } from '../nav-account-slot'

type Props = { cta: WishlistPromo['cta']; next: string }

async function Resolved(props: Props) {
  return <WishCta {...props} signedIn={await signedIn()} />
}

// The home wishlist section's CTA: like the nav's account slot, the only request-time read in
// it, so the section stays in the static page with the signed-out button as the fallback.
export function HomeWishCtaSlot(props: Props) {
  return (
    <Suspense fallback={<WishCta {...props} signedIn={false} />}>
      <Resolved {...props} />
    </Suspense>
  )
}
