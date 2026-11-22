import { NextResponse, type NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { createAdminSupabase } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { isShareImageSide, sharedImageUrl } from '@/core/work-share'

// GET → one image of a shared work collection (ARCHITECTURE §6.2「作品集分享」). Public on purpose:
// the share link is the key, so the recipient needs no account. The link is checked on every
// request (live, not revoked, the work still in it and not deleted); `after` is the result as
// anyone but its owner may see it (a free work always marked, a paid one clean), `before` the
// 768px preview of the photo it was made from, only when the sharer opted in. Anything else is
// the same 404. A 302 to a 5-minute signed URL: no image bytes pass the function, no storage
// address sits in the page, and nothing is cached in shared caches.
export async function GET(_request: NextRequest, { params }: RouteContext<'/api/s/w/[shareId]/[jobId]/[side]'>) {
  try {
    const { shareId, jobId, side } = await params
    if (!isShareImageSide(side)) throw new AppError('NOT_FOUND', 'Not found')
    const url = await sharedImageUrl({ db: createAdminSupabase(), store: r2Store() }, { shareId, jobId, side })
    return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return errorResponse(error, 'work_share.image')
  }
}
