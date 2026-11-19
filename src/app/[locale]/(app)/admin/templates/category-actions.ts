'use server'

import { refresh } from 'next/cache'

import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { runAdminAction } from '@/core/admin'
import { moveTemplateCategory } from '@/core/admin/template-categories'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

export async function moveTemplateCategoryAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await moveTemplateCategory(createAdminSupabase(), admin.id, input)
    // Category order groups the home and landing template sections: live on the next load.
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    refresh()
  })
}
