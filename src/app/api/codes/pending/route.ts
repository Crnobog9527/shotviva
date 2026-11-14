import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, getSessionUser } from '@/core/auth'
import { CODE_COOKIE, normalizeCode } from '@/core/codes'
import { readPendingDiscount } from '@/core/codes/server'

export async function GET(request: NextRequest) {
  const guestCode = Boolean(normalizeCode(request.cookies.get(CODE_COOKIE)?.value))
  try {
    const user = await getSessionUser()
    if (!user?.verified || user.banned) return jsonResponse({ buyer: false, guestCode: !user && guestCode, pending: null })
    const pending = await readPendingDiscount(createAdminSupabase(), user.id)
    return jsonResponse({ buyer: true, guestCode: false, pending })
  } catch (error) {
    return errorResponse(error, 'codes/pending')
  }
}
