'use server'

import { refresh } from 'next/cache'

import { runAdminAction, runAdminQuery } from '@/core/admin'
import { deleteFeaturedBundle, saveFeaturedBundle, setDefaultFeaturedBundles } from '@/core/admin/featured-bundles'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'
import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

// 精选组合 (migration 2004): the home page reads bundles under the templates tag, so each write
// expires it once and the page shows the change on its next load.
async function afterWrite() {
  await updateCatalogueTag(TEMPLATES_CACHE_TAG)
  warmPublicPagesSoon()
  refresh()
}

export async function saveFeaturedBundleAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await saveFeaturedBundle(createAdminSupabase(), admin.id, input)
    await afterWrite()
    return id
  })
}

export async function deleteFeaturedBundleAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await deleteFeaturedBundle(createAdminSupabase(), admin.id, input)
    await afterWrite()
  })
}

export async function setDefaultFeaturedBundlesAction(input: unknown) {
  const admin = await requireAdmin()
  return runAdminAction(async () => {
    await setDefaultFeaturedBundles(createAdminSupabase(), admin.id, input)
    await afterWrite()
  })
}
