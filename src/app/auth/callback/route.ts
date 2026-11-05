// Public by necessity: Google OAuth returns here before the visitor has a session, and
// email links sent before /auth/confirm existed still point here.
import type { NextRequest } from 'next/server'

import { handleAuthCallback } from '@/core/auth'
import { site } from '@/site/site.config'

export async function GET(request: NextRequest) {
  return handleAuthCallback(request, { freeCredits: site.billing.freeCredits })
}
