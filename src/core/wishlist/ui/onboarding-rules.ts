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

// The teaching sheet's walk (Owner 2026-11-11): every step in order, no skipping. `reached` is
// the furthest step shown so far; `visit` counts step changes, so a step's demo replays when
// the user comes back to it.
export type Tour = { step: number; reached: number; visit: number }

export const startTour: Tour = { step: 0, reached: 0, visit: 0 }

// "Next" moves one step on; the last step has no next.
export function tourNext(tour: Tour, count: number): Tour {
  if (tour.step >= count - 1) return tour
  return show(tour, tour.step + 1)
}

// The dots go back to any step already seen, never forward past one not yet shown.
export function tourJump(tour: Tour, target: number): Tour {
  if (target < 0 || target > tour.reached || target === tour.step) return tour
  return show(tour, target)
}

function show(tour: Tour, step: number): Tour {
  return { step, reached: Math.max(tour.reached, step), visit: tour.visit + 1 }
}

// The sheet can be closed, and counts as seen, only once its last step has been shown.
export const tourDone = (tour: Tour, count: number) => tour.reached >= count - 1
