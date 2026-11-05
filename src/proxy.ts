import type { NextRequest } from 'next/server'

import { updateSession } from '@/core/auth'

// Refreshes the Supabase session cookie before rendering; access control itself is
// done by requireUser()/requireAdmin() in each page, not here.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
