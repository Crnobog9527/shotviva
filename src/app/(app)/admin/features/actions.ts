'use server'

import { refresh, updateTag } from 'next/cache'

import { runAdminAction, saveFeatureAccess, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { FEATURES_CACHE_TAG } from '@/core/features'

// Server actions are public endpoints, so this re-checks the admin role itself. A save expires
// the features cache at once, so the gate changes on the next request (ARCHITECTURE §6.2).
function featuresChanged() {
  updateTag(FEATURES_CACHE_TAG)
  refresh()
}

export async function saveFeatureAccessAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(() => saveFeatureAccess({ db: createAdminSupabase(), invalidate: featuresChanged }, admin.id, input))
}
