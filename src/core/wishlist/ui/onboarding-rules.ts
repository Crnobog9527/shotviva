// The wishlist's first-run decisions (Owner 2026-11-10), apart so they can be tested alone.

// The teaching sheet's one primary: post a wish, or below the threshold (no succeeded photo
// yet, ARCHITECTURE §15.1) make the photo that opens it.
export function guideAction(eligible: boolean): { href: '/wishlist/new' | '/generate'; label: 'wish' | 'photoFirst' } {
  return eligible ? { href: '/wishlist/new', label: 'wish' } : { href: '/generate', label: 'photoFirst' }
}

// The tab's dot shows until the account opens the wall: from the server flag, and in this tab
// as soon as the wall has been opened (the layout does not re-render on a soft navigation).
export function showsTabDot(seen: boolean, visitedHere: boolean): boolean {
  return !seen && !visitedHere
}

export const isWishlistPath = (pathname: string) => pathname === '/wishlist' || pathname.startsWith('/wishlist/')
