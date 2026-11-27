'use server'

import { refresh } from 'next/cache'

import { updateCatalogueTag } from '@/core/templates/catalogue-invalidation'
import { syncDueProvider } from '@/core/admin/providers/refresh-capabilities'
import { runProviderAction } from '@/core/admin/providers'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { PROVIDERS_CACHE_TAG } from '@/core/providers'
import { warmPublicPagesSoon } from '@/app/warm-public-pages'

export async function syncTemplateModel(id: string, retry = false) {
  await requireAdmin()
  return runProviderAction(async () => {
    if (await syncDueProvider({ db: createAdminSupabase() }, { id }, retry === true)) {
      await updateCatalogueTag(PROVIDERS_CACHE_TAG)
      warmPublicPagesSoon()
    }
    // Even if another session won the refresh, reload the quote/floors for this open dialog.
    refresh()
  })
}
