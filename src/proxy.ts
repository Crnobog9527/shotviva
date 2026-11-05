import type { NextRequest } from 'next/server'

import { proxyGate } from '@/core/auth'

// Refreshes the Supabase session and answers /admin (404) and signed-in pages (307 to
// login) with real statuses before rendering; pages still call requireUser()/requireAdmin().
export async function proxy(request: NextRequest) {
  return proxyGate(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
