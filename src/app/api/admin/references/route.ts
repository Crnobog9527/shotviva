import type { NextRequest } from 'next/server'

import { referencePage } from '@/core/admin/reference-library/read'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiAdmin } from '@/core/auth'

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    return jsonResponse(await referencePage(createAdminSupabase(), Object.fromEntries(request.nextUrl.searchParams)))
  } catch (error) {
    return errorResponse(error, 'admin-references-list')
  }
}
