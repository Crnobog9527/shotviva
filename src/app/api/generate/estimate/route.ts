import { connection, type NextRequest } from 'next/server'
import { z } from 'zod'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { requireApiUser } from '@/core/auth'
import { AppError } from '@/core/errors'
import { cachedDurationEstimate } from '@/core/jobs/duration-estimate-cached'
import { RESOLUTIONS } from '@/core/templates'

const querySchema = z.object({ template: z.string().min(1).max(100), resolution: z.enum(RESOLUTIONS) })

// GET ?template&resolution → how long that generation usually takes, in whole seconds (p50 /
// p75), or { estimate: null } when there are too few real jobs to say. Only those two numbers:
// no provider, model or cost. Signed-in only, read once by the wait screen of a job the caller
// just started; the cached read means traffic here never reaches the database more than once
// per template and size every 15 minutes.
export async function GET(request: NextRequest) {
  // Never prerender: the answer depends on the session and the query.
  await connection()
  try {
    await requireApiUser()
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!query.success) throw new AppError('INVALID_INPUT', 'template and resolution are required')
    const estimate = await cachedDurationEstimate(query.data.template, query.data.resolution)
    return jsonResponse({ estimate: estimate ? { p50_s: Math.round(estimate.p50Ms / 1000), p75_s: Math.round(estimate.p75Ms / 1000) } : null })
  } catch (error) {
    return errorResponse(error, 'generate-estimate')
  }
}
