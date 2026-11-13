import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { AppError } from '@/core/errors'
import { POSTER_SOURCES, savePosterSet } from '@/core/poster/sets'
import { loadGenerationTemplate } from '@/core/templates'

// POST { template_id, content, source } → 200 { id, parts }. Saves the text the user confirmed
// and how it splits into posters (ARCHITECTURE §5.3); each poster is then one POST /api/generate
// with poster: { set_id, part }. Invited accounts only.
const bodySchema = z.object({
  template_id: z.string().min(1).max(64),
  content: z.unknown(),
  source: z.enum(POSTER_SOURCES).default('manual'),
})

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Invalid poster set')
    const db = createAdminSupabase()
    const { template } = await loadGenerationTemplate(db, body.data.template_id, 'web')
    const saved = await savePosterSet(db, {
      userId: user.id, templateId: template.id, fields: template.fields, content: body.data.content, source: body.data.source,
    })
    return jsonResponse(saved)
  } catch (error) {
    return errorResponse(error, 'poster.sets')
  }
}
