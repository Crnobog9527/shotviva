import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { thumbnailForAsset } from '@/modules/image'

export const maxDuration = 60
const asset = z.object({ kind: z.enum(['photo', 'run']), id: z.uuid() })

async function thumbnail(request: NextRequest, mode: 'read' | 'repair') {
  try {
    await requireApiAdmin()
    if (mode === 'repair') assertSameOrigin(request)
    const parsed = asset.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) throw new AppError('INVALID_INPUT', '无效的缩略图')
    const { kind, id } = parsed.data
    const url = await thumbnailForAsset(createAdminSupabase(), r2Store(), kind, id, mode)
    if (!url) throw new AppError('NOT_FOUND', '图片已删除')
    if (mode === 'repair') return Response.json({ url }, { headers: { 'Cache-Control': 'private, no-store' } })
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } })
  } catch (error) { return errorResponse(error, 'admin-test-thumbnail') }
}

export const GET = (request: NextRequest) => thumbnail(request, 'read')
export const POST = (request: NextRequest) => thumbnail(request, 'repair')
