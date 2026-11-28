import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { recordJobDownload } from '@/core/jobs'

// POST → notes one download of the caller's own work, with nothing sent back. For a phone whose
// browser cannot share files (ARCHITECTURE §6.2): the work is shown full size for a long-press
// save, through GET /api/files/:id without ?download=1, so the page says here that it was shown.
// The same record as an explicit download (T82); record_job_download only touches the caller's
// own finished works, so any other id does nothing. Best effort like the download route's note.
export async function POST(request: NextRequest, { params }: RouteContext<'/api/files/[jobId]/saved'>) {
  try {
    const user = await requireApiUser()
    const jobId = (await params).jobId
    if (!z.uuid().safeParse(jobId).success) throw new AppError('NOT_FOUND', 'Not found')
    await recordJobDownload(createAdminSupabase(), { userId: user.id, jobId, ip: clientIp(request.headers) })
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'files.saved')
  }
}
