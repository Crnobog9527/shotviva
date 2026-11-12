import 'server-only'

import { headers } from 'next/headers'

// The line under the Google button (core/auth/ui/google-mainland-note.tsx): always on /zh, and on
// an English page when Vercel places the request in mainland China. CN only: Hong Kong (HK) and
// Macau (MO) have their own codes and Google works there; a visitor on a VPN shows the VPN's
// country, and Google works for them too.
export async function googleMainlandNote(locale: string): Promise<boolean> {
  if (locale === 'zh') return true
  return (await headers()).get('x-vercel-ip-country') === 'CN'
}
