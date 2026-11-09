import { notFound } from 'next/navigation'
import { z } from 'zod'

import { COPY, InvitesReport, redemptions, topInviters } from '@/core/admin/code-reports'
import { createAdminSupabase, requireAdmin } from '@/core/auth'

export const instant = false
export const metadata = { title: COPY.invites }
const query = z.object({ period: z.enum(['month', 'all']).optional(), cursor: z.string().max(512).optional() })

export default async function InvitesPage({ searchParams }: PageProps<'/[locale]/admin/codes/invites'>) {
  const actor = await requireAdmin()
  const filters = query.safeParse(await searchParams)
  if (!filters.success) notFound()
  const allTime = filters.data.period === 'all'
  const db = createAdminSupabase()
  const [leaders, blocked] = await Promise.all([
    topInviters(db, actor.id, allTime), redemptions(db, actor.id, null, filters.data.cursor),
  ])
  return <InvitesReport leaders={leaders} blocked={blocked} allTime={allTime} cursor={filters.data.cursor} />
}
