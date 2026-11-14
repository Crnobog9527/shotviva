import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { listManagedAssets, removeAssets } from '@/modules/image'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    return jsonResponse(await removeAssets({db:createAdminSupabase(),store:r2Store()},admin.id,await request.json().catch(() => null)))
  } catch (error) { return errorResponse(error,'admin-test-assets') }
}

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    const params = Object.fromEntries(request.nextUrl.searchParams)
    return jsonResponse(await listManagedAssets(createAdminSupabase(), r2Store(), params))
  } catch (error) { return errorResponse(error, 'admin-test-assets') }
}
