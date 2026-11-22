import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { resolveOrgWorkFile } from '@/core/org/works'
import { r2Store } from '@/core/storage'

// GET → 302 to a 5-minute signed URL of one 企业作品 for the org's owner (ARCHITECTURE §6.5):
// ?size=thumb (the list's small copy, else the full file) or the full original, ?download=1 as an
// attachment. Signed-in only; anyone who does not own the work's org gets 404. No image bytes pass
// through, and nothing is cached in shared caches.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/account/enterprise/works/[jobId]'>) {
  try {
    const user = await requireApiUser()
    const query = request.nextUrl.searchParams
    const url = await resolveOrgWorkFile(
      { db: createAdminSupabase(), store: r2Store() },
      { owner: user.id, jobId: (await params).jobId, size: query.get('size') === 'thumb' ? 'thumb' : 'full', download: query.get('download') === '1' },
    )
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return errorResponse(error, 'org.works.file')
  }
}
