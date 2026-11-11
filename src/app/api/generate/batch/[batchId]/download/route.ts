import type { NextRequest } from 'next/server'
import { after } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { downloadBatchZip, recordJobDownload } from '@/core/jobs'
import { DEFAULT_DOWNLOAD_BACKGROUND, isDownloadBackground } from '@/core/storage/rules/download-background'

export const maxDuration = 300

// One request per download: every call claims the ZIP once (claim_batch_zip counts it towards
// the per-minute limit) and, when it hands over the signed link, records each photo's download
// once. The app asks with Accept: application/json and gets { url } to send the browser to; a
// plain GET (a pasted link) is answered with a 302 to the same link. ?bg=white|transparent: how
// cut-outs go into the ZIP (ARCHITECTURE §8 「下载白底 / 透明底」); white when absent or unknown.
export async function GET(request: NextRequest, context: RouteContext<'/api/generate/batch/[batchId]/download'>) {
  try {
    const user = await requireApiUser()
    const { batchId } = await context.params
    if (!z.uuid().safeParse(batchId).success) throw new AppError('NOT_FOUND', 'Batch not found')
    const db = createAdminSupabase()
    const bg = request.nextUrl.searchParams.get('bg')
    const result = await downloadBatchZip(db, user.id, batchId, isDownloadBackground(bg) ? bg : DEFAULT_DOWNLOAD_BACKGROUND)
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
    if (wantsJson(request)) return jsonResponse({ url: result.url })
    return new Response(null, { status: 302, headers: { Location: result.url, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'generate.batch.download')
  }
}

const wantsJson = (request: NextRequest) => (request.headers.get('accept') ?? '').includes('application/json')
