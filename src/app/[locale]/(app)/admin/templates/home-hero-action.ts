'use server'

import { refresh } from 'next/cache'

import { runAdminAction } from '@/core/admin'
import { saveHomeHero } from '@/core/admin/home-hero'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// 首页首屏大图 (migration 2007): the home page reads the scenes under the templates tag, so a save
// expires it once and the page shows the change on its next load.
export async function saveHomeHeroAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await saveHomeHero(createAdminSupabase(), admin.id, input)
    await updateCatalogueTag(TEMPLATES_CACHE_TAG)
    warmPublicPagesSoon()
    refresh()
  })
}
