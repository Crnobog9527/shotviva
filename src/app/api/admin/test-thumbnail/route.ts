import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { thumbnailForAsset } from '@/modules/image'

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    const parsed = z.object({ kind: z.enum(['photo', 'run']), id: z.uuid() }).safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) throw new AppError('INVALID_INPUT', '无效的缩略图')
    const { kind, id } = parsed.data
    const url = await thumbnailForAsset(createAdminSupabase(), r2Store(), kind, id)
    if (!url) throw new AppError('NOT_FOUND', '图片已删除')
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } })
  } catch (error) { return errorResponse(error, 'admin-test-thumbnail') }
}
