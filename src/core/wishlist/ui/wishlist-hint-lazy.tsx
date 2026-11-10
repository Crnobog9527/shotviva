'use client'

import dynamic from 'next/dynamic'

// The shell mounts the one-time hint on every app page, so it is loaded only when a photo has
// come out (AfterSuccess) instead of riding in each page's first-load JS (scripts/js-budget.ts).
// Imported by path, not through ./index, which would pull in the whole Wishlist UI.
export const WishlistHintLazy = dynamic(() => import('./wishlist-hint').then((m) => m.WishlistHint), { ssr: false })
