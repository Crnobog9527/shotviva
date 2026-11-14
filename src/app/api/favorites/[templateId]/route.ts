import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createServerSupabase, requireApiUser } from '@/core/auth'
import { setFavorite } from '@/core/favorites'

type Context = RouteContext<'/api/favorites/[templateId]'>

// PUT saves the template for the signed-in user, DELETE removes it → { saved }. Signed-in only;
// both run on the user's own session, so RLS limits them to the caller's rows (ARCHITECTURE
// §5.1b).
async function respond(request: NextRequest, { params }: Context, saved: boolean) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const { templateId } = await params
    return jsonResponse(await setFavorite(await createServerSupabase(), user.id, templateId, saved))
  } catch (error) {
    return errorResponse(error, 'favorites.set')
  }
}

export function PUT(request: NextRequest, context: Context) {
  return respond(request, context, true)
}

export function DELETE(request: NextRequest, context: Context) {
  return respond(request, context, false)
}
