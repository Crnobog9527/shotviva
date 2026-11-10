'use client'

import dynamic from 'next/dynamic'

// The shell mounts the "your wish came true" banner on every app page, but only for an account
// with unread notices, so its code loads then instead of riding in each page's first-load JS
// (scripts/js-budget.ts). Imported by path, not through ./index, which would pull in the whole
// Wishlist UI.
export const WishNoticeLazy = dynamic(() => import('./wish-notice').then((m) => m.WishNotice), { ssr: false })
