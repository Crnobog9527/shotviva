// Public by necessity: every auth email (signup, password reset, email change, magic link)
// links here before the visitor has a session.
import type { NextRequest } from 'next/server'

import { handleAuthConfirm } from '@/core/auth'
import { site } from '@/site/site.config'

export async function GET(request: NextRequest) {
  return handleAuthConfirm(request, { freeCredits: site.billing.freeCredits })
}
