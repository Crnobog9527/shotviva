'use server'

import { refresh } from 'next/cache'

import { runAdminAction } from '@/core/admin'
import { saveHomeCaseStrip } from '@/core/admin/home-case-strip'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// 首页「更多真实案例」 (migration 2006): the home page reads the list under the templates tag, so a
// save expires it once and the page shows the change on its next load.
export async function saveHomeCaseStripAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveHomeCaseStrip(createAdminSupabase(), admin.id, input)
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    warmPublicPagesSoon()
    refresh()
  })
}
