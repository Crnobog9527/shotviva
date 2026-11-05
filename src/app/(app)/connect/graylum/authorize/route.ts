import type { NextRequest } from 'next/server'

import { createAdminSupabase, getSessionUser } from '@/core/auth'
import { handleConnectAuthorize } from '@/core/partner'
import { site } from '@/site/site.config'

// The "Allow" form on /connect/graylum posts here: signed-in user + same origin → one-time
// code → 302 to Graylum's allowlisted callback (ARCHITECTURE §14.2).
export async function POST(request: NextRequest) {
  return handleConnectAuthorize(request, {
    db: createAdminSupabase,
    user: getSessionUser,
    config: site.partners.graylum,
  })
}
