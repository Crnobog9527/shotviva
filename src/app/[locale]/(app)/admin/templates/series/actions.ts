'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { runAdminQuery } from '@/core/admin/templates'
import { deleteAdminSeries, reorderAdminSeries, saveAdminSeries, searchSeriesCandidates, setAdminSeriesFlag, type SaveSeriesInput } from '@/core/admin/template-series'
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

function refreshSeries() {
  updateTag(TEMPLATES_CACHE_TAG)
  revalidatePath('/[locale]/admin/templates/series', 'page')
}

// The whole series order in one call (Owner 2026-11-12).
export async function reorderSeriesAction(ids: string[]) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const moved = await reorderAdminSeries(createAdminSupabase(), admin.id, ids)
    refreshSeries()
    return moved
  })
}

// 上架 / 下架 or 成员单独展示 for several series, one transaction, one audit row each.
export async function setSeriesFlagAction(input: { ids: string[]; field: 'is_active' | 'show_members'; value: boolean; reason: string | null }) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const changed = await setAdminSeriesFlag(createAdminSupabase(), admin.id, input)
    refreshSeries()
    return changed
  })
}

// 删除已下架的系列, one or several (Owner 2026-11-14): one audited call per series, per-series results.
// Members leave the series, so the template list's series column changes too.
export async function deleteSeriesAction(ids: string[]) {
  const admin = await requireAdmin()
  return runAdminQuery(async () => {
    const outcome = await deleteAdminSeries(createAdminSupabase(), admin.id, { ids })
    refreshSeries()
    revalidatePath('/[locale]/admin/templates', 'page')
    return outcome
  })
}
