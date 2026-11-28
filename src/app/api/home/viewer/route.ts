import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { LOCALES } from '@/core/i18n'

import type { HomeMember } from '../../../home-member'
import { readHomePaywall, readHomeStanding, readHomeViewer } from '../../../home-viewer'

const localeSchema = z.enum(LOCALES)

// GET ?locale= → { viewer, standing, paywall }: the signed-in half of the home generator (balance,
// limits, saved templates, photos developing, the org pool offer), what the caller already holds,
// and what the paywall is told. The home and landing pages ask once the browser finds a session
// cookie ((marketing)/home-viewer-gate.tsx), so they need no request-time read themselves.
// Signed-in and verified only, the caller's own data only, never cached. Nothing is granted here:
// reserve_credits and checkout check every charge on the server.
export async function GET(request: NextRequest) {
  try {
    const locale = localeSchema.safeParse(request.nextUrl.searchParams.get('locale'))
    if (!locale.success) throw new AppError('INVALID_INPUT', 'Unknown locale')
    const user = await requireApiUser()
    const [viewer, standing, paywall] = await Promise.all([readHomeViewer(user.id), readHomeStanding(user.id), readHomePaywall(locale.data)])
    return jsonResponse({ viewer, standing, paywall } satisfies HomeMember)
  } catch (error) {
    return errorResponse(error, 'home-viewer')
  }
}
