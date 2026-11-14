import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiBuyer } from '@/core/auth'
import { AppError } from '@/core/errors'
import { activeCredentials } from '@/core/providers'
import { r2Store } from '@/core/storage'
import { preparePhotoExtract } from '@/modules/image/posters'

// POST { template_id, input_key } → 拍照识别 (ARCHITECTURE §5.3「每周复用」): the photo of an old
// poster, already uploaded to R2 like any photo (no image bytes here, AGENTS §6), is read line
// by line and sorted into the blocks. NDJSON like 整理内容: { stage } lines while the model
// sorts, then { status, content?, unverified?, clipped?, text? }. Shares its 30-an-hour limit.
// Reading the photo, then possibly sorting it with the model, each under its own deadline.
export const maxDuration = 120

const bodySchema = z.object({ template_id: z.string().min(1).max(64), input_key: z.string().min(1).max(200) })

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiBuyer()
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Choose a photo of the poster')
    const deps = { db: createAdminSupabase(), store: r2Store, credentials: () => activeCredentials('decision') }
    const prepared = await preparePhotoExtract(deps, { userId: user.id, templateId: body.data.template_id, inputKey: body.data.input_key })
    if (prepared.kind === 'done') return jsonResponse(prepared.result)
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        // The calls run to their end (and are recorded) even if the editor has gone away.
        const line = (value: unknown) => {
          try { controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)) } catch { /* closed by the client */ }
        }
        line(await prepared.run((stage) => line({ stage })))
        try { controller.close() } catch { /* closed by the client */ }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) {
    return errorResponse(error, 'poster.extract_photo')
  }
}
