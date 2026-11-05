import type { NextRequest } from 'next/server'

import { handleDeleteAccount } from '@/core/auth'

// Requires a session (checked in the handler) plus a same-origin request.
export async function POST(request: NextRequest) {
  return handleDeleteAccount(request)
}
