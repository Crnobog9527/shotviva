'use server'

import { refresh, updateTag } from 'next/cache'

import { runAdminAction, saveEditTemplate, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { CREDITS_FLOOR } from '@/modules/image'

// A public endpoint like every server action, so it re-checks the admin role itself.
export async function saveEditTemplateAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveEditTemplate(createAdminSupabase(), admin.id, input, CREDITS_FLOOR)
    // The photo page reads whether editing is on and what it costs.
    updateTag(TEMPLATES_CACHE_TAG)
    refresh()
  })
}
