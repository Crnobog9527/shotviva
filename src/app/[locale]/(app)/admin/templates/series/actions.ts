'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { runAdminQuery } from '@/core/admin/templates'
import { saveAdminSeries, searchSeriesCandidates, type SaveSeriesInput } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { TEMPLATES_CACHE_TAG } from '@/core/templates'

export async function saveSeriesAction(input: SaveSeriesInput) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const id = await saveAdminSeries(createAdminSupabase(), admin.id, input)
    revalidateTag(TEMPLATES_CACHE_TAG, 'max')
    revalidatePath('/[locale]/admin/templates/series', 'page')
    revalidatePath('/[locale]/admin/templates', 'page')
    return id
  })
}

export async function searchMembersAction(search: string, after: string | null) {
  await requireAdmin()
  return runAdminQuery(() => searchSeriesCandidates(createAdminSupabase(), search, after))
}
