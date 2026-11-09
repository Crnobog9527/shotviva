import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { loadUserExtras } from './detail-reads'
import type { UserDetailData } from './detail-types'
import { ledgerPage, loadUser, recentJobs } from './repository'

// Everything the user detail dialog shows (ARCHITECTURE §10.a, T77), read the way the old
// /admin/users/[id] page did: profile and Auth by primary key, recent jobs, one ledger page, then
// the five 「用户详情补全」 blocks. Plain data, so a server action can hand it to the dialog.

const inputSchema = z.object({
  userId: z.string().max(64),
  // The job a lookup landed on, highlighted in the jobs table.
  jobId: z.string().max(64).nullish(),
  cursor: z.string().max(400).nullish(),
})

export type UserDetailRequest = z.infer<typeof inputSchema>

export async function loadUserDetail(db: SupabaseClient, input: unknown, affiliate = false): Promise<UserDetailData | null> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return null
  const { userId, jobId, cursor } = parsed.data
  const [user, jobs, ledger] = await Promise.all([loadUser(db, userId, affiliate), recentJobs(db, userId, jobId), ledgerPage(db, userId, cursor)])
  if (!user) return null
  const extras = await loadUserExtras(db, user)
  return { user, jobs, ledger, ledgerPaged: Boolean(cursor), extras }
}
