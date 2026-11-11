import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { isStaffAccount } from '@/core/analytics'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { assertGalleryEnabled } from '@/core/gallery'
import { localeOfReferer } from '@/core/i18n'
import { submitReport } from '@/core/moderation'
import { site } from '@/site/site.config'

// POST { jobId, reason, note? } → 200 { outcome }. Signed-in only; a closed gallery is a 404
// (ARCHITECTURE §9 第 1、8 条). report_work allows only works the gallery shows.
export async function POST(request: NextRequest) {
  try {
    await assertGalleryEnabled(site)
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body: unknown = await request.json().catch(() => null)
    const ctx = {
      locale: localeOfReferer(request.headers.get('referer')) ?? 'en',
      count: serverEnv().VERCEL_ENV === 'production' && !isStaffAccount(user, site.brand.domain),
    }
    return jsonResponse({ outcome: await submitReport(createAdminSupabase(), user.id, body, ctx) })
  } catch (error) {
    return errorResponse(error, 'gallery.report')
  }
}
