'use server'

import { refresh } from 'next/cache'

import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { runAdminAction } from '@/core/admin'
import { saveLocaleDisplay } from '@/core/admin/locale-display'
import { moveTemplateCategory } from '@/core/admin/template-categories'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

export async function moveTemplateCategoryAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await moveTemplateCategory(createAdminSupabase(), admin.id, input)
    // Category order groups the home and landing template sections: live on the next load.
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    warmPublicPagesSoon()
    refresh()
  })
}

// Per-language display rules (migrations 1575, 2003): the admin arranges one language's draft and
// saves it once; the home page, its featured list and rail, and Create's category bar read it on
// the next load of that language.
export async function saveLocaleDisplayAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveLocaleDisplay(createAdminSupabase(), admin.id, input)
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    warmPublicPagesSoon()
    refresh()
  })
}
