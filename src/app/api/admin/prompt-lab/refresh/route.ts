import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { labRpc } from '@/core/admin/prompt-lab/commands'
import { readLabRuns } from '@/core/admin/prompt-lab/store'
import { readInput } from '@/core/admin/reference-library/inputs'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { loadTestBudget } from '@/modules/image'

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const actor = await requireApiAdmin()
    const db = createAdminSupabase()
    const { sessionId } = readInput(z.object({ sessionId: z.uuid() }), await req.json().catch(() => null))
    await labRpc(db, 'admin_expire_prompt_lab_runs', { p_actor: actor.id })
    const [runs, budget] = await Promise.all([readLabRuns(db, sessionId), loadTestBudget(db)])
    return jsonResponse({ runs, budget })
  } catch (e) { return errorResponse(e, 'admin-prompt-lab-refresh') }
}
