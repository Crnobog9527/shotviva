import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { AppError } from '@/core/errors'
import { activeCredentials } from '@/core/providers'
import { EXTRACT_TEXT_MAX, prepareExtract } from '@/modules/image/posters'

// POST { template_id, text } → 整理内容 for a dense-text poster (ARCHITECTURE §5.3), 30 calls an
// hour. A notice the parser sorts comes back at once as JSON { status, content?, unverified?,
// clipped? }. One that needs the model comes back as NDJSON: a { stage } line as each block
// starts, then the same JSON as the last line. A model failure is status 'failed' so the editor
// simply starts empty.
const bodySchema = z.object({ template_id: z.string().min(1).max(64), text: z.string().min(1).max(EXTRACT_TEXT_MAX) })

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Paste between 1 and 6000 characters')
    const deps = { db: createAdminSupabase(), credentials: () => activeCredentials('decision') }
    const prepared = await prepareExtract(deps, { userId: user.id, templateId: body.data.template_id, text: body.data.text })
    if (prepared.kind === 'done') return jsonResponse(prepared.result)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // The model call runs to its end (and is recorded) even if the editor has gone away.
        const line = (value: unknown) => {
          try { controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)) } catch { /* closed by the client */ }
        }
        line(await prepared.run((stage) => line({ stage })))
        try { controller.close() } catch { /* closed by the client */ }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) {
    return errorResponse(error, 'poster.extract')
  }
}
