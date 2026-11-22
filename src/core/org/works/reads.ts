import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../../billing/rpc'
import { DELETED_MAKERS } from './makers'

// 企业作品 (ARCHITECTURE §6.5, migrations 1941–1944, 1970–1972): the org owner's view of the works
// its members made with org credits, removed members included, and works whose maker deleted
// their account (archived, no maker: userId null). Service role only; `owner` is the signed-in
// account's own id from the session, and the SQL finds the org it owns, so no other org's works
// can be named.

export const ORG_WORKS_PAGE = 30

const uuid = z.uuid()
const workRow = z.object({
  id: z.uuid(),
  user_id: z.uuid().nullable(),
  template_id: z.string(),
  template_name: z.string().nullable(),
  created_at: z.string(),
  aspect_ratio: z.string().nullable(),
  member_active: z.boolean(),
})
const memberRow = z.object({
  user_id: z.uuid().nullable(),
  role: z.enum(['owner', 'member']),
  status: z.enum(['active', 'removed', 'deleted']),
  removed_at: z.string().nullable(),
  works: z.number().int(),
})

export type OrgWork = { id: string; userId: string | null; templateId: string; templateName: string | null; createdAt: string; aspectRatio: string | null; memberActive: boolean }
export type OrgWorkMember = { userId: string | null; role: 'owner' | 'member'; status: 'active' | 'removed' | 'deleted'; removedAt: string | null; works: number }
// member: a member's id, or DELETED_MAKERS for the archived works.
export type OrgWorksQuery = { member?: string; limit?: number; before?: { at: string; id: string } }

export async function orgOwnerWorks(client: RpcClient, owner: string, query: OrgWorksQuery = {}): Promise<OrgWork[]> {
  const archived = query.member === DELETED_MAKERS
  const rows = await callRpc(client, 'org_owner_work_list', {
    p_owner: uuid.parse(owner),
    p_member: query.member && !archived ? uuid.parse(query.member) : null,
    p_archived: archived,
    p_limit: query.limit ?? ORG_WORKS_PAGE,
    p_before_at: query.before?.at ?? null,
    p_before_id: query.before ? uuid.parse(query.before.id) : null,
  }, z.array(workRow))
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, templateId: r.template_id, templateName: r.template_name,
    createdAt: r.created_at, aspectRatio: r.aspect_ratio, memberActive: r.member_active,
  }))
}

export async function orgOwnerWorkMembers(client: RpcClient, owner: string): Promise<OrgWorkMember[]> {
  const rows = await callRpc(client, 'org_owner_work_makers', { p_owner: uuid.parse(owner) }, z.array(memberRow))
  return rows.map((r) => ({ userId: r.user_id, role: r.role, status: r.status, removedAt: r.removed_at, works: r.works }))
}

const fileRow = z.object({ id: z.uuid(), user_id: z.uuid().nullable(), credit_pool: z.enum(['free', 'paid']), output_key: z.string(), archive_key: z.string().nullable() })
// archiveKey: where an unfinished account deletion copies a live work (served once it exists).
export type OrgWorkFile = { id: string; userId: string | null; creditPool: 'free' | 'paid'; outputKey: string; archiveKey: string | null }

// One finished org work of the owner's org, live or archived, or null (a missing one, another
// org's, a deleted one).
export async function orgOwnerWork(client: RpcClient, owner: string, jobId: string): Promise<OrgWorkFile | null> {
  if (!uuid.safeParse(jobId).success) return null
  const rows = await callRpc(client, 'org_owner_work_file', { p_owner: uuid.parse(owner), p_job_id: jobId }, z.array(fileRow))
  const row = rows[0]
  return row ? { id: row.id, userId: row.user_id, creditPool: row.credit_pool, outputKey: row.output_key, archiveKey: row.archive_key } : null
}
