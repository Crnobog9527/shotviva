import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { r2Store } from '@/core/storage'
import { templateIdsOf, weeklyAct, weeklyPeek } from '@/modules/image/posters'

// 每周复用 (ARCHITECTURE §5.3) for one template's editor, signed-in accounts only, own data only.
// GET ?also=<id>,<id> (the series' other styles) → { last, store }: whether there is a last
// issue, and the store details as text. Copies nothing.
// POST { want: 'last', also } → the last issue, its kept photos copied back to fresh uploads;
// { want: 'store_qr' } → the store's QR code as a fresh upload (or null); { want: 'autofill_off' }.
const deps = () => ({ db: createAdminSupabase(), store: r2Store })

export async function GET(request: NextRequest, { params }: RouteContext<'/api/weekly/[templateId]'>) {
  try {
    const user = await requireApiUser()
    const { templateId } = await params
    const also = (request.nextUrl.searchParams.get('also') ?? '').split(',').filter(Boolean)
    return jsonResponse(await weeklyPeek(deps(), user.id, templateIdsOf(templateId, also)))
  } catch (error) {
    return errorResponse(error, 'weekly.peek')
  }
}

export async function POST(request: NextRequest, { params }: RouteContext<'/api/weekly/[templateId]'>) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const { templateId } = await params
    return jsonResponse(await weeklyAct(deps(), user.id, templateId, await request.json().catch(() => null)))
  } catch (error) {
    return errorResponse(error, 'weekly.act')
  }
}
