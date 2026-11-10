import { notFound } from 'next/navigation'
import { z } from 'zod'

import { listAdminCategoryTree } from '@/core/admin/template-categories'
import { categoryChoices } from '@/core/admin/templates-editor'
import { getAdminSeries, listAdminSeriesPage, searchSeriesCandidates, seriesCopy, SeriesEditor, SeriesList } from '@/core/admin/template-series'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { saveSeriesAction, searchMembersAction } from './actions'

export const instant = false
export const metadata = { title: seriesCopy.title }

const paramsSchema = z.object({
  q: z.string().trim().max(160).default(''), id: z.uuid().optional(), new: z.literal('1').optional(), saved: z.literal('1').optional(),
  after: z.uuid().optional(), order: z.coerce.number().int().gte(-2147483648).lte(2147483647).optional(),
}).refine(p => Boolean(p.after) === (p.order !== undefined))

function listCursor(p: z.infer<typeof paramsSchema>) {
  return p.after && p.order !== undefined ? { id: p.after, order: p.order } : null
}

export default async function AdminSeriesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const parsed = paramsSchema.safeParse(await searchParams)
  if (!parsed.success) notFound()
  const p = parsed.data
  const db = createAdminSupabase()
  if (!p.id && !p.new) {
    const cursor = listCursor(p)
    return <SeriesList page={await listAdminSeriesPage(db, cursor, p.q)} search={p.q} first={!cursor} saved={!!p.saved} />
  }
  const [detail, categories, initial] = await Promise.all([
    p.id ? getAdminSeries(db, p.id) : null, listAdminCategoryTree(db), searchSeriesCandidates(db, '', null),
  ])
  if (p.id && !detail) notFound()
  return <SeriesEditor key={detail?.revision ?? 'new'} detail={detail} initial={initial}
    choices={categoryChoices(categories)} actions={{ save: saveSeriesAction, search: searchMembersAction }} />
}
