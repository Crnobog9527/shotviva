import type { NextRequest } from 'next/server'

import { finishStyleRef, stageStyleRef, styleRefPreview } from '@/core/admin/style-refs'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireApiAdmin()
    return jsonResponse(await stageStyleRef(r2Store(), await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-style-ref-upload')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request)
    await requireApiAdmin()
    return jsonResponse(await finishStyleRef(r2Store(), await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'admin-style-ref-finish')
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    const url = await styleRefPreview(r2Store(), Object.fromEntries(request.nextUrl.searchParams))
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (error) {
    return errorResponse(error, 'admin-style-ref-preview')
  }
}
