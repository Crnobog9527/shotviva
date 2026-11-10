'use client'

import { useEffect, useState } from 'react'

import { useMarkOnce } from './use-mark-once'

const VISIBLE_MS = 10_000

// The one-time "you can request templates now" toast. The shell mounts it once a photo has come
// out (AfterSuccess); it marks the account's flag as it comes up and leaves after ten seconds or
// on close.
export function useWishlistHint(markSeen: () => Promise<void>) {
  const [visible, setVisible] = useState(true)
  useMarkOnce(true, markSeen)
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [visible])
  return { visible, dismiss: () => setVisible(false) }
}
