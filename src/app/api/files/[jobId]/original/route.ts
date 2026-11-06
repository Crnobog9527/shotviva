import { NextResponse } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { resolveJobOriginal } from '@/core/jobs'
import { r2Store } from '@/core/storage'

// GET → 302 to a 5-minute signed URL for the 768px preview of the photo the user uploaded for
// this job (ARCHITECTURE §8 「原图小图」, T32). Signed-in owner only; anyone else gets 404.
export async function GET(_request: Request, { params }: RouteContext<'/api/files/[jobId]/original'>) {
  try {
    const user = await requireApiUser()
    const deps = { db: createAdminSupabase(), store: r2Store() }
    const url = await resolveJobOriginal(deps, { userId: user.id, jobId: (await params).jobId })
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'files')
  }
}
