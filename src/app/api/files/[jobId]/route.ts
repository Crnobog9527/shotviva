import { after, NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { recordJobDownload, resolveJobFile } from '@/core/jobs'
import { r2Store } from '@/core/storage'

const NO_STORE = 'private, no-store'

// GET → the job's image for its owner (?download=1 for an attachment). Clean outputs
// redirect to a 5-minute signed R2 URL; free public works come back watermarked as JPEG
// (ARCHITECTURE §6.2). Signed-in only; non-owners get 404.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/files/[jobId]'>) {
  try {
    const user = await requireApiUser()
    const download = request.nextUrl.searchParams.get('download') === '1'
    const deps = { db: createAdminSupabase(), store: r2Store() }
    const jobId = (await params).jobId
    const file = await resolveJobFile(deps, { userId: user.id, jobId, download })
    // Dispute evidence (T82): a download is noted after the response, never slowing it.
    if (download) after(() => recordJobDownload(deps.db, { userId: user.id, jobId, ip: clientIp(request.headers) }))
    if (file.kind === 'redirect') {
      return NextResponse.redirect(file.url, { status: 302, headers: { 'Cache-Control': NO_STORE } })
    }
    const headers: Record<string, string> = { 'Content-Type': file.contentType, 'Cache-Control': NO_STORE }
    if (download) headers['Content-Disposition'] = `attachment; filename="${file.filename}"`
    return new NextResponse(file.body as BodyInit, { headers })
  } catch (error) {
    return errorResponse(error, 'files')
  }
}
