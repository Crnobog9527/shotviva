import type { NextRequest } from 'next/server'
import { isAffiliateEnabled } from '@/core/affiliate/feature'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { localeOfReferer } from '@/core/i18n'
import { createTemplateShare, sharerRefSlug, templateShareInputSchema, templateShareUrl } from '@/core/template-shares'

// POST makes a template collection share link for the signed-in user (ARCHITECTURE §5.1g) →
// { id, url }. The picked entries, the cap and the rate limit are checked by
// template_share_create in the same transaction as the insert; the link carries the sharer's
// partner slug when they have one.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = templateShareInputSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Invalid share link')
    const admin = createAdminSupabase()
    const id = await createTemplateShare(admin, user.id, body.data)
    const locale = localeOfReferer(request.headers.get('referer')) ?? user.locale ?? 'en'
    const ref = await sharerRefSlug(admin, user.id, isAffiliateEnabled)
    return jsonResponse({ id, url: templateShareUrl(id, locale, ref) })
  } catch (error) {
    return errorResponse(error, 'template_shares.create')
  }
}
