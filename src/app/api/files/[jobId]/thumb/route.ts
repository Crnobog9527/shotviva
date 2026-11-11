import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase, requireApiUser } from '@/core/auth'
import { resolveJobThumb } from '@/core/jobs'
import { r2Store } from '@/core/storage'

// GET → 302 to the small copy of the job's image that lists show (ARCHITECTURE §8.3「作品小图」):
// a 5-minute signed R2 URL, watermarked when the work is. A work with no small copy gets one
// made here; failing that, the redirect goes to the full file. Signed-in owner only; anyone
// else gets 404. No image bytes pass through.
export async function GET(request: NextRequest, { params }: RouteContext<'/api/files/[jobId]/thumb'>) {
  try {
    const user = await requireApiUser()
    const deps = { db: createAdminSupabase(), store: r2Store() }
    const target = await resolveJobThumb(deps, { userId: user.id, jobId: (await params).jobId })
    return NextResponse.redirect(new URL(target, request.nextUrl), { status: 302, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return errorResponse(error, 'files')
  }
}
