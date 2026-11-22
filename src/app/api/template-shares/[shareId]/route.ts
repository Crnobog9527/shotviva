import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { revokeTemplateShare } from '@/core/template-shares'

type Context = RouteContext<'/api/template-shares/[shareId]'>

// DELETE revokes one of the signed-in user's own share links → { revoked } (false when it is
// not theirs, unknown or already revoked). The page then shows it as no longer available.
export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const { shareId } = await params
    return jsonResponse({ revoked: await revokeTemplateShare(createAdminSupabase(), user.id, shareId) })
  } catch (error) {
    return errorResponse(error, 'template_shares.revoke')
  }
}
