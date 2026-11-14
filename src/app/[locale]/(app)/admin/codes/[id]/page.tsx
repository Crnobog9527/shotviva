import { notFound } from 'next/navigation'
import { z } from 'zod'

import { CodeDetail, COPY, loadCode, redemptions } from '@/core/admin/code-reports'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readInviteRewards } from '@/core/codes/server'
import { toggleCode } from '../report-actions'

export const instant = false
export const metadata = { title: COPY.details }
const query = z.object({ cursor: z.string().max(512).optional() })

export default async function DetailPage({ params, searchParams }: PageProps<'/[locale]/admin/codes/[id]'>) {
  const actor = await requireAdmin()
  const { id } = await params
  const filters = query.safeParse(await searchParams)
  if (!z.uuid().safeParse(id).success || !filters.success) notFound()
  const db = createAdminSupabase()
  const [code, page, invite] = await Promise.all([loadCode(db, actor.id, id), redemptions(db, actor.id, id, filters.data.cursor), readInviteRewards(db)])
  if (!code) notFound()
  return <CodeDetail code={code} page={page} cursor={filters.data.cursor} invite={invite} toggle={toggleCode} now={page.observedAt} />
}
