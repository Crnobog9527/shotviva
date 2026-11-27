import type { NextRequest } from 'next/server'

import { errorResponse } from '@/core/api-response'
import { resolveAdminOrgWorkThumb } from '@/core/admin/org-works/thumb'
import { createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'

// GET → 302 to a 5-minute signed URL of one org work's small picture, for the admin 企业作品
// list on /admin/orgs/[id]. Admins only (anyone else: 404); only works stamped with an org.
// Never cached in shared caches.
export async function GET(_request: NextRequest, { params }: RouteContext<'/api/admin/org-works/[jobId]/thumb'>) {
  try {
    await requireApiAdmin()
    const url = await resolveAdminOrgWorkThumb({ db: createAdminSupabase(), store: r2Store() }, (await params).jobId)
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return errorResponse(error, 'admin.org-works.thumb')
  }
}
