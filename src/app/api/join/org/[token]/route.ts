import type { NextRequest } from 'next/server'

import { handleJoinIntent } from '@/core/org/join-intent'

// Public on purpose: the invite page sends signed-out visitors here on their way to sign-up, to
// mark that they came from this invite (core/org/join-intent.ts). It reads nothing but the session.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/join/org/[token]'>) {
  return handleJoinIntent(request, (await params).token)
}
