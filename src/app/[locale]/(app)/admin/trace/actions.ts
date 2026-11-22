'use server'

import { stageTrace, traceUpload } from '@/core/admin/trace'
import { runAdminQuery } from '@/core/admin/templates'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { r2Store } from '@/core/storage'

// 水印追查 (ARCHITECTURE §6.2): admin only, like every /admin action.
export async function stageTraceAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => stageTrace(r2Store(), input))
}

export async function readTraceAction(input: unknown) {
  await requireAdmin()
  return runAdminQuery(() => traceUpload({ db: createAdminSupabase(), store: r2Store() }, input))
}
