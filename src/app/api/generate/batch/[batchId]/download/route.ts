import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { downloadBatchZip, recordJobDownload } from '@/core/jobs'
import { after } from 'next/server'

export const maxDuration = 300

export async function GET(request: NextRequest, context: RouteContext<'/api/generate/batch/[batchId]/download'>) {
  try {
    const user = await requireApiUser()
    const { batchId } = await context.params
    if (!z.uuid().safeParse(batchId).success) throw new AppError('NOT_FOUND', 'Batch not found')
    const db = createAdminSupabase()
    const result = await downloadBatchZip(db, user.id, batchId)
    if (result.status !== 'ready') {
      const limited = result.status === 'limited'
      const response = limited
        ? jsonResponse({ code: 'RATE_LIMITED', message: 'Too many batch download requests' }, 429)
        : jsonResponse({ status: 'packing' }, 202)
      response.headers.set('Retry-After', '60')
      return response
    }
    const ip = clientIp(request.headers)
    after(() => Promise.all(result.files.map(file => recordJobDownload(db, {
      userId: user.id, jobId: file.jobId, ip,
    }))).then(() => undefined))
    return new Response(null, { status: 302, headers: { Location: result.url, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'generate.batch.download')
  }
}
