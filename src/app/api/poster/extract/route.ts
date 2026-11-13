import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { AppError } from '@/core/errors'
import { activeCredentials } from '@/core/providers'
import { EXTRACT_TEXT_MAX, runExtract } from '@/modules/image/posters'

// POST { template_id, text } → 200 { status, content?, unverified? }. 整理内容 for a dense-text
// poster (ARCHITECTURE §5.3): invited accounts only (requireFeature), 30 calls an hour. A model
// failure is a 200 with status 'failed' so the editor simply starts empty.
const bodySchema = z.object({ template_id: z.string().min(1).max(64), text: z.string().min(1).max(EXTRACT_TEXT_MAX) })

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Paste between 1 and 6000 characters')
    const deps = { db: createAdminSupabase(), credentials: () => activeCredentials('decision') }
    return jsonResponse(await runExtract(deps, { userId: user.id, templateId: body.data.template_id, text: body.data.text }))
  } catch (error) {
    return errorResponse(error, 'poster.extract')
  }
}
