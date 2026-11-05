import type { NextRequest } from 'next/server'

import { proxyGate } from '@/core/auth'

// Refreshes the Supabase session and answers /admin (404) and signed-in pages (307 to
// login) with real statuses before rendering; pages still call requireUser()/requireAdmin().
export async function proxy(request: NextRequest) {
  return proxyGate(request)
}

// /ingest is the PostHog proxy (next.config.ts rewrites): no session work for analytics beacons.
export const config = {
  matcher: ['/((?!_next/static|_next/image|ingest/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
