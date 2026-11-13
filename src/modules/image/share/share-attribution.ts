'use client'

import { track } from '@/core/analytics/browser'
import { encodeShareMark, parseShareMark, SHARE_COOKIE, SHARE_COOKIE_MAX_AGE, type ShareMark } from '@/core/analytics/share-link'

// The share page remembers the link it was opened from (core/analytics/share-link.ts); the
// sign-up event reads it on the server, and the first photo started from that same template
// counts once as template_share_generate, after which the mark is cleared.

export function rememberShare(mark: ShareMark): void {
  document.cookie = `${SHARE_COOKIE}=${encodeShareMark(mark)}; Path=/; Max-Age=${SHARE_COOKIE_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

export function readShare(cookie: string = document.cookie): ShareMark | null {
  const entry = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SHARE_COOKIE}=`))
  return parseShareMark(entry?.slice(SHARE_COOKIE.length + 1))
}

export function noteShareGenerate(templateId: string): void {
  const mark = readShare()
  if (!mark || mark.templateId !== templateId) return
  track('template_share_generate', { template_id: templateId, share_id: mark.shareId })
  document.cookie = `${SHARE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
