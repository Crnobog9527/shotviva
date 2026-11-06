'use server'

import { refresh, updateTag } from 'next/cache'

import { clearCostSettings, COSTS_CACHE_TAG, runAdminAction, saveCostSettings, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

// Server actions are public endpoints, so each re-checks the admin role. Neither returns the
// key. Both expire the cached bill so the next view reads OpenAI with the new setting.
function settingsChanged() {
  updateTag(COSTS_CACHE_TAG)
  refresh()
}

export async function saveCostSettingsAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveCostSettings(createAdminSupabase(), admin.id, input)
    settingsChanged()
  })
}

export async function clearCostSettingsAction(): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await clearCostSettings(createAdminSupabase(), admin.id)
    settingsChanged()
  })
}
