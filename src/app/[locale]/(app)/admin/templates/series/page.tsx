import { notFound } from 'next/navigation'
import { z } from 'zod'

import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { categoryChoices } from '@/core/admin/templates-editor'
import { getAdminSeries, listAdminSeries, searchSeriesCandidates, seriesCopy, SeriesCatalogue, SeriesDialog, SeriesEditor } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { serverEnv } from '@/core/env'
import { reorderSeriesAction, saveSeriesAction, searchMembersAction, setSeriesFlagAction } from './actions'

export const instant = false
export const metadata = { title: seriesCopy.title }

const paramsSchema = z.object({ id: z.uuid().optional(), new: z.literal('1').optional(), saved: z.literal('1').optional() })
  .loose()

// The whole list, with the editor in a dialog over it for ?id= / ?new=1 (Owner 2026-11-12).
export default async function AdminSeriesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const parsed = paramsSchema.safeParse(await searchParams)
  if (!parsed.success) notFound()
  const p = parsed.data
  const db = createAdminSupabase()
  const [items, editor] = await Promise.all([listAdminSeries(db), p.id || p.new ? editorDialog(db, p.id) : null])
  // Production's series follow the test site (T93): edits there are overwritten by the next sync.
  const production = serverEnv().VERCEL_ENV === 'production'
  return (
    <>
      <SeriesCatalogue items={items} saved={!!p.saved} production={production}
        actions={{ reorder: reorderSeriesAction, setFlag: setSeriesFlagAction }} />
      {editor}
    </>
  )
}

async function editorDialog(db: ReturnType<typeof createAdminSupabase>, id: string | undefined) {
  const [detail, categories, initial] = await Promise.all([
    id ? getAdminSeries(db, id) : null, listAdminCategoryTree(db), searchSeriesCandidates(db, '', null),
  ])
  if (id && !detail) notFound()
  return (
    <SeriesDialog title={detail ? seriesCopy.edit : seriesCopy.create}>
      <SeriesEditor embedded key={detail?.revision ?? 'new'} detail={detail} initial={initial}
        choices={categoryChoices(categories)} actions={{ save: saveSeriesAction, search: searchMembersAction }} />
    </SeriesDialog>
  )
}
