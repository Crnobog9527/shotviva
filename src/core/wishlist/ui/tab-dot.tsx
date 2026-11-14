'use client'

import { useEffect, useState } from 'react'

import { usePathname } from '../../i18n/navigation'
import { isWishlistPath, showsTabDot } from './onboarding-rules'

// Opened in this tab already: kept outside React because the tab bar unmounts on flow pages,
// and the layout that read the server flag does not render again on a soft navigation.
let visitedHere = false

// The Wishlist tab's "new" dot (Owner 2026-11-10): safelight, like the Account tab's reply dot,
// until the account first opens the wall. The layout renders it only while the account's
// onboarding.wishlistSeen is unset; opening the wall hides it here at once. It hops every few
// seconds so it is noticed (globals.css dot-hop, Owner 2026-11-11).
export function WishlistTabDot({ label }: { label: string }) {
  const pathname = usePathname()
  const [visited] = useState(() => visitedHere)
  const onWall = isWishlistPath(pathname)
  useEffect(() => {
    if (onWall) visitedHere = true
  }, [onWall])
  if (!showsTabDot(false, visited || visitedHere || onWall)) return null
  return (
    <>
      <span aria-hidden="true" className="dot-hop inline-block size-2.5 shrink-0 rounded-full bg-primary max-md:absolute max-md:top-2 max-md:left-[calc(50%+8px)] md:ml-1" />
      <span className="sr-only">{label}</span>
    </>
  )
}
