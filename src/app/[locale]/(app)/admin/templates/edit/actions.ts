'use server'

import { refresh } from 'next/cache'

import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { runAdminAction, saveEditTemplate, type ActionResult } from '@/core/admin'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { readTemplateFloors } from '@/site/template-pricing'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// A public endpoint like every server action, so it re-checks the admin role itself.
export async function saveEditTemplateAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    const db = createAdminSupabase()
    await saveEditTemplate(db, admin.id, input, await readTemplateFloors(db))
    // The photo page reads whether editing is on and what it costs.
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    warmPublicPagesSoon()
    refresh()
  })
}
