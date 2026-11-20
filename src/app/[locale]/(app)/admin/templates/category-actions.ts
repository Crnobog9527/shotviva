'use server'

import { refresh } from 'next/cache'

import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { runAdminAction } from '@/core/admin'
import { setLocaleCategoryOrder, setLocaleFeatured } from '@/core/admin/locale-display'
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

// Per-language display rules (migration 1575): the home page, its featured list and Create's
// category bar read these on the next load of each language.
export async function setLocaleCategoryOrderAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setLocaleCategoryOrder(createAdminSupabase(), admin.id, input)
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    refresh()
  })
}

export async function setLocaleFeaturedAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setLocaleFeatured(createAdminSupabase(), admin.id, input)
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    refresh()
  })
}
