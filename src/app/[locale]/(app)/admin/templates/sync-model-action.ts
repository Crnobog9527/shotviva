'use server'

import { refresh, updateTag } from 'next/cache'

import { syncDueProvider } from '@/core/admin/providers/refresh-capabilities'
import { runProviderAction } from '@/core/admin/providers'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { PROVIDERS_CACHE_TAG } from '@/core/providers'

export async function syncTemplateModel(id: string, retry = false) {
  await requireAdmin()
  return runProviderAction(async () => {
    if (await syncDueProvider({ db: createAdminSupabase() }, { id }, retry === true)) updateTag(PROVIDERS_CACHE_TAG)
    // Even if another session won the refresh, reload the quote/floors for this open dialog.
    refresh()
  })
}
