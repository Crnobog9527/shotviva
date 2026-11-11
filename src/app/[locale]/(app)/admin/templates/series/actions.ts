'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { runAdminQuery } from '@/core/admin/templates'
import { saveAdminSeries, searchSeriesCandidates, type SaveSeriesInput } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

export async function saveSeriesAction(input: SaveSeriesInput) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await saveAdminSeries(createAdminSupabase(), admin.id, input)
    // A series and its member order show on the public template sections: live on the next load.
    updateTag(TEMPLATES_CACHE_TAG)
    revalidatePath('/[locale]/admin/templates/series', 'page')
    revalidatePath('/[locale]/admin/templates', 'page')
    return id
  })
}

export async function searchMembersAction(search: string, after: string | null) {
  await requireAdmin()
  return runAdminQuery(() => searchSeriesCandidates(createAdminSupabase(), search, after))
}
