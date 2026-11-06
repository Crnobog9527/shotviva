import { arrivedFrom } from '@/core/auth'
import { ArrivedNote } from '@/core/auth/ui'
import { CONNECT_PAGE_PATH } from '@/core/partner'
import { HomeDraftNote } from '@/modules/image'
import { site } from '@/site/site.config'

// Graylum's own mark (design/assets/img/graylum-mark.png, Owner-supplied 2026-11-06).
const GRAYLUM_MARK = '/brand/graylum-mark.png'

// "It comes from Shotviva <support@shotviva.com>" on the check-your-email views (ARCHITECTURE §7).
export const sender = `${site.brand.name} <${site.brand.contactEmail}>`

// The line under the login / sign-up title for a visitor who came from the home generator
// (only when this browser still holds the photo) or from the Graylum connect page.
export function Arrived({ next, page }: { next: string; page: 'login' | 'signup' }) {
  const from = arrivedFrom(next, CONNECT_PAGE_PATH)
  if (from === 'home') return <HomeDraftNote page={page} />
  if (from === 'graylum') return <ArrivedNote kind="graylum" page={page} image={GRAYLUM_MARK} />
  return null
}
