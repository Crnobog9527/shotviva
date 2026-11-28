import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc, type RpcClient } from '../../billing/rpc'
import { AppError } from '../../errors'
import type { OwnJobsCursor } from '../../jobs'
import { DELETED_MAKERS } from './makers'

// 作品页就是企业作品 (ARCHITECTURE §6.5, migration 2037, Owner 2026-11-28): while an org's
// enterprise workspace is on, every active member's Photos page lists the whole company's works,
// their own personal works among them. Service role only; `user` is the signed-in account's own id
// from the session, and the SQL finds, on every call, the org it holds an active seat in whose
// workspace is on, so a removed member or a switched-off workspace reads nothing here.

export const COMPANY_PHOTOS_PAGE = 48
// As Photos' own list: at most this many works above the cursor are listed again.
const MAX_WINDOW = 1000

// Who in the address: nothing (all), 'me', 'personal', DELETED_MAKERS, or a member's id.
export const ME = 'me'
export const PERSONAL = 'personal'
export type CompanyFilter = string | null

const row = z.object({
  id: z.uuid(),
  user_id: z.uuid().nullable(),
  org_work: z.boolean(),
  archived: z.boolean(),
  template_id: z.string(),
  template_name: z.string().nullable(),
  created_at: z.string(),
  aspect_ratio: z.string().nullable(),
  member_active: z.boolean(),
})

// orgWork false: one of the reader's own personal works. archived: a deleted account's (no maker).
export type CompanyPhoto = { id: string; userId: string | null; orgWork: boolean; archived: boolean; templateId: string; templateName: string | null; createdAt: string; aspectRatio: string | null; memberActive: boolean }
export type CompanyPhotos = { works: CompanyPhoto[]; total: number; next: OwnJobsCursor | null }
export type CompanySeat = { orgId: string; owner: boolean }

// The org whose works the account's Photos page shows: the one it holds an active seat in, when
// that org's workspace is on. null for everyone else (no org, removed, workspace off), who get the
// ordinary personal page. The SQL functions make the same check again on every read.
export async function readCompanySeat(db: SupabaseClient, user: string): Promise<CompanySeat | null> {
  const seat = await db.from('org_members').select('org_id,role').eq('user_id', user).eq('status', 'active').maybeSingle()
  if (seat.error) throw new AppError('INTERNAL', `company seat failed: ${seat.error.message}`)
  if (!seat.data) return null
  const org = await db.from('orgs').select('id,status,owner_user_id').eq('id', seat.data.org_id as string).maybeSingle()
  if (org.error) throw new AppError('INTERNAL', `company seat org failed: ${org.error.message}`)
  if (!org.data || org.data.status !== 'active') return null
  return { orgId: org.data.id as string, owner: org.data.owner_user_id === user && seat.data.role === 'owner' }
}

const uuid = z.uuid()

// The address's filter as the SQL's scope. Anything that is not a known word or a uuid is "all".
export function companyScope(filter: CompanyFilter): { p_scope: string; p_member: string | null } {
  if (filter === ME) return { p_scope: 'mine', p_member: null }
  if (filter === PERSONAL) return { p_scope: 'personal', p_member: null }
  if (filter === DELETED_MAKERS) return { p_scope: 'archived', p_member: null }
  if (filter && uuid.safeParse(filter).success) return { p_scope: 'member', p_member: filter }
  return { p_scope: 'all', p_member: null }
}

const toPhoto = (r: z.infer<typeof row>): CompanyPhoto => ({
  id: r.id, userId: r.user_id, orgWork: r.org_work, archived: r.archived, templateId: r.template_id,
  templateName: r.template_name, createdAt: r.created_at, aspectRatio: r.aspect_ratio, memberActive: r.member_active,
})

// One screen of the company view, as listOwnJobs reads the personal one: everything from the
// newest down to `until` (the last work already shown) plus the next page, and the count of all.
export async function listCompanyPhotos(client: RpcClient, user: string, query: { filter?: CompanyFilter; until?: OwnJobsCursor | null } = {}): Promise<CompanyPhotos> {
  const scope = { p_user: uuid.parse(user), ...companyScope(query.filter ?? null) }
  const until = query.until ?? null
  const rows = z.array(row)
  const [above, page, total] = await Promise.all([
    until ? callRpc(client, 'org_member_photos', { ...scope, p_limit: MAX_WINDOW, p_from_at: until.createdAt, p_from_id: until.id }, rows) : Promise.resolve([]),
    callRpc(client, 'org_member_photos', { ...scope, p_limit: COMPANY_PHOTOS_PAGE + 1, ...(until ? { p_before_at: until.createdAt, p_before_id: until.id } : {}) }, rows),
    callRpc(client, 'org_member_photos_count', scope, z.number().int()),
  ])
  const below = page.slice(0, COMPANY_PHOTOS_PAGE)
  const last = below.at(-1)
  return {
    works: [...above, ...below].map(toPhoto),
    total,
    next: page.length > COMPANY_PHOTOS_PAGE && last ? { createdAt: last.created_at, id: last.id } : null,
  }
}
