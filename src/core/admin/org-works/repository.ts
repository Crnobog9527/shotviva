import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { jobRef, jobRefRange, jobRefsOrShort, modelFromTag } from '@/core/jobs'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { workFilter, type OrgWorkFilters } from './filters'

// 企业作品 for the site admin (/admin/orgs/[id]): every generation_jobs row stamped with the org
// (1941), newest first, failed and running ones and works the member deleted or lost access to
// included, so the Owner can find the one an enterprise customer complains about. Service role
// only, behind requireAdmin on the page; no new grant. Index generation_jobs_org_works_idx
// (org_id, created_at desc, id desc) drives the walk; a member is generation_jobs_org_member_works_idx;
// a work id is a range on the primary key. Which pool paid is read from the reserve's own draw
// rows (org_held_draws, org_promo_draws: primary key = 'job:<id>:reserve'); what came back is the
// refund ledger row (unique idempotency key 'job:<id>:refund'). Provider cost is not read: the
// list never shows it.

const COLUMNS = 'id, created_at, finished_at, user_id, template_id, status, provider, credit_pool, credits_cost, error_code, resolution:inputs->>resolution, deleted_at, org_access_ended_at'

const rowSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  user_id: z.uuid(),
  template_id: z.string(),
  status: z.enum(['running', 'succeeded', 'failed']),
  provider: z.string().nullable(),
  credit_pool: z.enum(['free', 'paid']),
  credits_cost: z.number(),
  error_code: z.string().nullable(),
  resolution: z.string().nullable(),
  deleted_at: z.string().nullable(),
  org_access_ended_at: z.string().nullable(),
})

const drawSchema = z.array(z.object({ debit_key: z.string(), drawn: z.number(), restored: z.number() }))
const refundSchema = z.array(z.object({ idempotency_key: z.string(), delta: z.number() }))

// Credits of one work by where they came from: the org's paid credits (held by the member), the
// org's promotion share, and anything the member paid from their own balance.
export type OrgWorkCredits = { orgPaid: number; orgPromo: number; personal: number }

export type AdminOrgWork = {
  id: string
  ref: string
  createdAt: string
  durationMs: number | null
  userId: string
  templateId: string
  templateName: string | null
  status: 'running' | 'succeeded' | 'failed'
  model: string
  resolution: string
  errorCode: string | null
  // The member-ledger pool the reserve came from (a promotion share is 'free').
  creditPool: 'free' | 'paid'
  creditsCost: number
  credits: OrgWorkCredits
  // Credits that came back (a failed work's refund); 0 when none did.
  refunded: number
  deletedByUser: boolean
  // The maker has left the org: the work is hidden from them, still the org's.
  makerLeft: boolean
}

export const reserveKey = (jobId: string) => `job:${jobId}:reserve`
export const refundKey = (jobId: string) => `job:${jobId}:refund`

type Row = z.infer<typeof rowSchema>
type Draw = z.infer<typeof drawSchema>[number]

// Pure, so the pool split is unit-tested: a reserve draws the member's own credits first and the
// org's after them, so whatever the draw rows do not cover was the member's own.
export function splitCredits(cost: number, held: Draw | undefined, promo: Draw | undefined): OrgWorkCredits {
  const orgPaid = held?.drawn ?? 0
  const orgPromo = promo?.drawn ?? 0
  return { orgPaid, orgPromo, personal: Math.max(0, cost - orgPaid - orgPromo) }
}

function toWork(row: Row): AdminOrgWork {
  return {
    id: row.id,
    ref: jobRef(row.id),
    createdAt: row.created_at,
    durationMs: row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.created_at) : null,
    userId: row.user_id,
    templateId: row.template_id,
    templateName: null,
    status: row.status,
    model: modelFromTag(row.provider) ?? row.provider ?? '—',
    resolution: row.resolution ?? '1k',
    errorCode: row.error_code,
    creditPool: row.credit_pool,
    creditsCost: row.credits_cost,
    credits: { orgPaid: 0, orgPromo: 0, personal: row.credits_cost },
    refunded: 0,
    deletedByUser: Boolean(row.deleted_at),
    makerLeft: Boolean(row.org_access_ended_at),
  }
}

function ok<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new AppError('INTERNAL', `org works read failed: ${what}`, { cause: new Error(result.error.message) })
  return result.data
}

async function listRows(db: SupabaseClient, orgId: string, filters: OrgWorkFilters, ref: string | null) {
  let query = db
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  if (ref) {
    const { from, to } = jobRefRange(ref)
    query = query.gte('id', from).lte('id', to)
  }
  if (filters.member) query = query.eq('user_id', filters.member)
  if (filters.status) query = query.eq('status', filters.status)
  const after = decodeCursor(filters.cursor)
  if (after) query = query.or(afterCursor(after))
  return rowSchema.array().parse(ok(await query, 'generation_jobs'))
}

// The draw rows, refunds and template names of one page: three primary-key reads in parallel.
async function enrich(db: SupabaseClient, works: AdminOrgWork[]): Promise<AdminOrgWork[]> {
  if (works.length === 0) return works
  const reserves = works.map((w) => reserveKey(w.id))
  const templateIds = [...new Set(works.map((w) => w.templateId))]
  const [held, promo, refunds, templates, refs] = await Promise.all([
    db.from('org_held_draws').select('debit_key, drawn, restored').in('debit_key', reserves),
    db.from('org_promo_draws').select('debit_key, drawn, restored').in('debit_key', reserves),
    db.from('credit_ledger').select('idempotency_key, delta').in('idempotency_key', works.map((w) => refundKey(w.id))),
    db.from('templates').select('id, name').in('id', templateIds),
    jobRefsOrShort(db, works.map((w) => w.id)),
  ])
  const byKey = (rows: Draw[]) => new Map(rows.map((r) => [r.debit_key, r]))
  const heldBy = byKey(drawSchema.parse(ok(held, 'org_held_draws')))
  const promoBy = byKey(drawSchema.parse(ok(promo, 'org_promo_draws')))
  const refundBy = new Map(refundSchema.parse(ok(refunds, 'credit_ledger')).map((r) => [r.idempotency_key, r.delta]))
  const names = new Map(z.array(z.object({ id: z.string(), name: z.string() })).parse(ok(templates, 'templates')).map((t) => [t.id, t.name]))
  return works.map((w) => ({
    ...w,
    ref: refs.get(w.id) ?? w.ref,
    templateName: names.get(w.templateId) ?? null,
    credits: splitCredits(w.creditsCost, heldBy.get(reserveKey(w.id)), promoBy.get(reserveKey(w.id))),
    refunded: Math.max(0, refundBy.get(refundKey(w.id)) ?? 0),
  }))
}

// One page of the org's works. A work id typed with the wrong shape matches nothing; the filter
// bar says why. `orgId` must be a uuid (the page 404s otherwise, before calling this).
export async function listOrgWorks(db: SupabaseClient, orgId: string, filters: OrgWorkFilters): Promise<Page<AdminOrgWork>> {
  const org = z.uuid().parse(orgId)
  const { ref, invalid } = workFilter(filters)
  if (invalid) return { items: [], nextCursor: null }
  const page = toPage(await listRows(db, org, filters, ref), toWork)
  return { ...page, items: await enrich(db, page.items) }
}
