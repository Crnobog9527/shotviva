import { Link } from '../../i18n/ui'
import type { WishlistPromo } from '../page-content'

type Props = { cta: WishlistPromo['cta']; signedIn: boolean; next: string }

// The wishlist section's one action. The home page's primary is the generator, so this is a
// ghost button (The One Primary Rule). Signed out it goes to sign-up and comes back to the
// Wishlist (`next`, already in the page's language); signed in, straight to the wall. It
// carries no user data, only whether someone is signed in.
export function WishCta({ cta, signedIn, next }: Props) {
  if (signedIn) {
    return (
      <Link href="/wishlist" className="mk-ghost-btn mk-wish-cta">
        {cta.signedIn}
      </Link>
    )
  }
  return (
    <Link href={`/signup?${new URLSearchParams({ next })}`} prefetch={false} className="mk-ghost-btn mk-wish-cta">
      {cta.signedOut}
    </Link>
  )
}
