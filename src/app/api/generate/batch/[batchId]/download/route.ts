import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { batchArchive, recordJobDownload } from '@/core/jobs'
import { signBatchZip } from '@/core/storage'
import { after } from 'next/server'

export const maxDuration = 300

export async function GET(request: NextRequest, context: RouteContext<'/api/generate/batch/[batchId]/download'>) {
  try {
    const user = await requireApiUser()
    const { batchId } = await context.params
    if (!z.uuid().safeParse(batchId).success) throw new AppError('NOT_FOUND', 'Batch not found')
    const db = createAdminSupabase()
    const archive = await batchArchive(db, user.id, batchId)
    const url = await signBatchZip(archive)
    const ip = clientIp(request.headers)
    after(() => Promise.all(archive.files.map(file => recordJobDownload(db, {
      userId: user.id, jobId: file.jobId, ip,
    }))).then(() => undefined))
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'generate.batch.download')
  }
}
