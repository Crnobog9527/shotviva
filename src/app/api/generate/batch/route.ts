import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { preflightBatch, preflightSchema } from '@/core/jobs'

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const user = await requireApiUser()
    const body = preflightSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'Invalid batch cells')
    return jsonResponse(await preflightBatch(createAdminSupabase(), user.id, body.data.cells))
  } catch (error) {
    return errorResponse(error, 'generate.batch')
  }
}
