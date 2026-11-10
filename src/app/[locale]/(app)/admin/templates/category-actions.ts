'use server'

import { refresh, revalidateTag } from 'next/cache'

import { runAdminAction } from '@/core/admin'
import { moveTemplateCategory } from '@/core/admin/template-categories'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

export async function moveTemplateCategoryAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await moveTemplateCategory(createAdminSupabase(), admin.id, input)
    revalidateTag(TEMPLATES_CACHE_TAG, 'max')
    refresh()
  })
}
