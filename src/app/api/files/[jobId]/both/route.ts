import { after, NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { recordJobDownload, resolveJobPair } from '@/core/jobs'
import { r2Store } from '@/core/storage'

// Flattening a 3K cut-out and packing two files the first time; later requests reuse the ZIP.
export const maxDuration = 60

// GET → a cut-out's 白底 + 透明 pair as one ZIP for its owner (ARCHITECTURE §8 「下载白底 / 透明底」):
// a 302 to a short signed R2 link, so no image bytes pass the function. One click is one
// download record (T82), like a single file: the dispute evidence counts the user's saves, not
// the files in the archive. Non-owners and works known to be opaque get 404.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/files/[jobId]/both'>) {
  try {
    const user = await requireApiUser()
    const jobId = (await params).jobId
    const db = createAdminSupabase()
    const file = await resolveJobPair({ db, store: r2Store() }, { userId: user.id, jobId })
    after(() => recordJobDownload(db, { userId: user.id, jobId, ip: clientIp(request.headers) }))
    if (file.kind !== 'redirect') throw new Error('pair download is always a signed link')
    return NextResponse.redirect(file.url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'files.both')
  }
}
