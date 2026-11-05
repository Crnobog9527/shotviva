// Public by necessity: Supabase sends email-confirmation, recovery and Google OAuth
// links here before the visitor has a session.
import type { NextRequest } from 'next/server'

import { handleAuthCallback } from '@/core/auth'
import { site } from '@/site/site.config'

export async function GET(request: NextRequest) {
  return handleAuthCallback(request, { freeCredits: site.billing.freeCredits })
}
