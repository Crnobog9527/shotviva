import type { NextRequest } from 'next/server'

import { labRpc, reverseInput } from '@/core/admin/prompt-lab/commands'
import { reverseSettings } from '@/core/admin/prompt-lab/store'
import { readInput } from '@/core/admin/reference-library/inputs'
import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { findProvider } from '@/core/providers'
import { assertPromptLabVisionCapability } from '@/modules/image'

export async function GET() {
  try {
    await requireApiAdmin()
    return jsonResponse(await reverseSettings(createAdminSupabase()))
  } catch (e) { return errorResponse(e, 'admin-prompt-lab-settings') }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const actor = await requireApiAdmin()
    const db = createAdminSupabase()
    const input = readInput(reverseInput, await req.json().catch(() => null))
    if (input.model) {
      const model = await findProvider(db, input.model)
      if (!model) throw new AppError('NOT_FOUND', '找不到所选模型')
      await assertPromptLabVisionCapability(model, db)
    }
    await labRpc(db, 'admin_set_prompt_lab_reverse', { p_actor: actor.id, p_model: input.model, p_instruction: input.instruction })
    return jsonResponse({ ok: true })
  } catch (e) { return errorResponse(e, 'admin-prompt-lab-settings') }
}
