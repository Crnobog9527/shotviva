import { z } from 'zod'
import { notFound } from 'next/navigation'

import { CodesList, COPY, codeKind, listCodes } from '@/core/admin/code-reports'
import { createAdminSupabase, requireAdmin } from '@/core/auth'
import { readInviteRewards } from '@/core/codes/server'
import { toggleCode } from './report-actions'

export const instant = false
export const metadata = { title: COPY.title }
const query = z.object({ kind: codeKind.optional(), cursor: z.string().max(512).optional() })

export default async function CodesPage({ searchParams }: PageProps<'/[locale]/admin/codes'>) {
  const actor = await requireAdmin()
  const filters = query.safeParse(await searchParams)
  if (!filters.success) notFound()
  const { kind = null, cursor } = filters.data
  const db = createAdminSupabase()
  const [page, invite] = await Promise.all([listCodes(db, actor.id, kind, cursor), readInviteRewards(db)])
  return <CodesList page={page} kind={kind} cursor={cursor} invite={invite} toggle={toggleCode} />
}
