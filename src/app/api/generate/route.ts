import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, clientIp, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { localeOfReferer } from '@/core/i18n'
import { generateBodySchema, runGeneration, toGenerationRequest } from '@/core/jobs'
import { r2Store } from '@/core/storage'
import { identityJudge, imageProvider, schedulePosterCheck } from '@/modules/image'

// Synchronous generation (ARCHITECTURE §4); the provider gets 240s of these 300 so a timeout
// can still be refunded. Signed-in only. Answers with the job (status + file_url), never bytes.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = generateBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'template_id is required')
    // The private template selects the image model; the decision provider screens user text.
    const judge = await identityJudge()
    const deps = { db: createAdminSupabase(), store: r2Store(), provider: imageProvider, identityJudge: judge, afterPoster: schedulePosterCheck }
    // The `generate` event's locale: the workspace page's language, else the account's.
    const locale = localeOfReferer(request.headers.get('referer')) ?? user.locale ?? undefined
    // The IP is kept on the job as dispute evidence (T82).
    const req = { ...toGenerationRequest(user.id, body.data), locale, clientIp: clientIp(request.headers) }
    return jsonResponse(await runGeneration(deps, req))
  } catch (error) {
    return errorResponse(error, 'generate')
  }
}
