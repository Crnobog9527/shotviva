// Public so the signup form can show the code's effects before an account exists.
// No claim, grant, account lookup or database write is performed.
import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { jsonResponse, errorResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase } from '@/core/auth'
import { normalizeCode } from '@/core/codes'
import { checkPreviewLimit } from '@/core/codes/api'
import { previewCode } from '@/core/codes/server'
import { AppError } from '@/core/errors'
import { site } from '@/site/site.config'

export async function GET(request: NextRequest) {
  try {
    checkPreviewLimit(clientIp(request.headers))
    const values = z.tuple([z.string()]).safeParse(request.nextUrl.searchParams.getAll('code'))
    const code = values.success ? normalizeCode(values.data[0]) : null
    if (!code) throw new AppError('INVALID_INPUT', 'Enter a valid code')
    const preview = await previewCode(createAdminSupabase(), code, site.growth.invite)
    return jsonResponse({ preview })
  } catch (error) {
    return errorResponse(error, 'codes/preview')
  }
}

// Next otherwise delegates HEAD to GET, outside the method-scoped public lookup rule.
export function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } })
}
