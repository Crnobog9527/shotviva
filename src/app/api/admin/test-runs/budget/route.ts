import type { NextRequest } from 'next/server'

import { errorResponse, jsonResponse } from '@/core/api-response'
import { assertSameOrigin, createAdminSupabase, requireApiAdmin } from '@/core/auth'
import { AppError } from '@/core/errors'
import { loadTestBudget, saveTestBudget, testBudgetBodySchema } from '@/modules/image'

// The daily test-run budget (ARCHITECTURE §10.b 「费用」): POST { budget_usd } saves it (0..1000,
// checked again by admin_set_system_setting) and answers with today's status. Admin only.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request)
    const admin = await requireApiAdmin()
    const body = testBudgetBodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) throw new AppError('INVALID_INPUT', '预算填 0～1000 美元')
    const db = createAdminSupabase()
    await saveTestBudget(db, admin.id, Math.round(body.data.budget_usd * 100) / 100)
    return jsonResponse(await loadTestBudget(db))
  } catch (error) {
    return errorResponse(error, 'admin-test-budget')
  }
}
