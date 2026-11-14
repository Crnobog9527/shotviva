'use client'

import { arrivedFrom } from '@/core/auth/redirect-target'
import { ArrivedNote } from '@/core/auth/ui'
import { HomeDraftNote } from '@/modules/image/marketing'

// Graylum's own mark (design/assets/img/graylum-mark.png, Owner-supplied 2026-11-06).
const GRAYLUM_MARK = '/brand/graylum-mark.png'

// The line under the login / sign-up title for a visitor who came from the home generator
// (only when this browser still holds the photo) or from the Graylum connect page. Rendered in
// the browser from ?next= (auth-screens.tsx); `connectPath` is core/partner's CONNECT_PAGE_PATH.
export function Arrived({ next, page, connectPath }: { next: string; page: 'login' | 'signup'; connectPath: string }) {
  const from = arrivedFrom(next, connectPath)
  if (from === 'home') return <HomeDraftNote page={page} />
  if (from === 'graylum') return <ArrivedNote kind="graylum" page={page} image={GRAYLUM_MARK} />
  return null
}
