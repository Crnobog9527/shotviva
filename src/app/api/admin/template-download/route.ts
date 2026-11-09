import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { signCoverDownload } from '@/core/admin/covers'
import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2PublicStore, r2Store } from '@/core/storage'
import { signTestRunDownload } from '@/modules/image'

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    const query = Object.fromEntries(request.nextUrl.searchParams)
    const url = 'runId' in query ? await downloadResult(query) : await signCoverDownload(createAdminSupabase(), r2PublicStore(), query)
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
  } catch (error) {
    return errorResponse(error, 'admin-template-download')
  }
}

async function downloadResult(query: Record<string, string>) {
  const parsed = z.strictObject({ runId: z.uuid() }).safeParse(query)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '试跑记录无效')
  return signTestRunDownload({ db: createAdminSupabase(), store: r2Store() }, parsed.data.runId)
}
