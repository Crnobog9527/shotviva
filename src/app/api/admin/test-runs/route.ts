import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { r2Store } from '@/core/storage'
import { identityJudge, imageProvider, loadPanelSummary, loadPanelRecords, loadTestPanel, runTestGenerate, signRun, testGenerateBodySchema } from '@/modules/image'

// Admin template test runs (ARCHITECTURE §10.b, T85). Admin only: anyone else gets a 404, as the
// admin pages do. GET is the panel's data (read only; the cleanup is POST ./cleanup); POST is one
// 「首次出图」, synchronous like /api/generate with the same 300 s budget —
// a ×3 batch is three parallel POSTs. Answers with signed URLs, never image bytes.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    await requireApiAdmin()
    const templateId = request.nextUrl.searchParams.get('template_id')
    const deps = { db: createAdminSupabase(), store: r2Store() }
    const section = request.nextUrl.searchParams.get('section')
    if (section === 'summary') return jsonResponse(await loadPanelSummary(deps))
    if (!templateId || templateId.length > 64) throw new AppError('INVALID_INPUT', 'template_id is required')
    if (section === 'records') return jsonResponse(await loadPanelRecords(deps, templateId))
    return jsonResponse(await loadTestPanel(deps, templateId))
  } catch (error) {
    return errorResponse(error, 'admin-test-runs')
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const body = testGenerateBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', 'run_id, batch_id and template_id are required')
    const judge = await identityJudge()
    const deps = { db: createAdminSupabase(), store: r2Store(), provider: imageProvider, identityJudge: judge }
    return jsonResponse(await signRun(deps.store, await runTestGenerate(deps, { actorId: admin.id, body: body.data })))
  } catch (error) {
    return errorResponse(error, 'admin-test-runs')
  }
}
