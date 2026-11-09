import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { enrollmentRow } from '@/core/affiliate/admin/enrollment'
import { AppError } from '@/core/errors'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { TOGGLE_COLUMNS, toggleColumnsSchema, toJobToggles } from '../jobs/job-toggles-row'
import { RECENT_JOBS, type LedgerEntry, type UserDetail, type UserJob } from './types'

// Reads for the user detail (T77: a dialog), service-role client only. Indexes: profiles primary
// key; credit_ledger_user_id_created_at_idx; generation_jobs_user_id_created_at_idx.

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `admin users ${what} failed`, { cause: new Error(error.message) })
}

const isUuid = (id: string) => z.uuid().safeParse(id).success

const role = z.enum(['user', 'admin']).catch('user')

const profileRow = z.object({
  id: z.uuid(),
  role,
  credits: z.number(),
  free_credits: z.number(),
  paid_until: z.string().nullable(),
  banned_at: z.string().nullable(),
  created_at: z.string(),
  signup_ip: z.string().nullable(),
  membership: enrollmentRow.nullable().optional(),
  referrer: z.object({ slug: z.string() }).nullable().optional(),
})

type Referrer = Pick<z.infer<typeof profileRow>, 'referrer'>

function referrerFact({ referrer }: Referrer): Pick<UserDetail, 'referrer'> {
  return referrer === undefined ? {} : { referrer: referrer?.slug ?? null }
}

// Profile by primary key; the email and phone are read live from Auth, never copied (ARCHITECTURE §10).
export async function loadUser(db: SupabaseClient, id: string, affiliate = false): Promise<UserDetail | null> {
  if (!isUuid(id)) return null
  const fields = 'id, role, credits, free_credits, paid_until, banned_at, created_at, signup_ip'
    + (affiliate ? ',referrer:affiliates!profiles_referred_by_fkey(slug),membership:affiliates!affiliates_user_id_fkey(slug,status,source:application->>source)' : '')
  const [profile, auth] = await Promise.all([
    db.from('profiles').select(fields).eq('id', id).maybeSingle(),
    db.auth.admin.getUserById(id),
  ])
  if (profile.error) fail('profile', profile.error)
  if (!profile.data) return null
  const row = profileRow.parse(profile.data)
  return {
    id: row.id,
    email: auth.data.user?.email || null,
    phone: auth.data.user?.phone || null,
    createdAt: row.created_at,
    role: row.role,
    credits: row.credits,
    freeCredits: row.free_credits,
    paidUntil: row.paid_until,
    bannedAt: row.banned_at,
    signupIp: row.signup_ip,
    membership: row.membership,
    ...referrerFact(row),
  }
}

const ledgerRow = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  created_at: z.string(),
  pool: z.enum(['free', 'paid']),
  kind: z.string(),
  delta: z.number(),
  balance_after: z.number(),
  reason: z.string(),
})

export async function ledgerPage(db: SupabaseClient, userId: string, cursor?: string | null): Promise<Page<LedgerEntry>> {
  if (!isUuid(userId)) return { items: [], nextCursor: null }
  let query = db
    .from('credit_ledger')
    .select('id, created_at, pool, kind, delta, balance_after, reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)
  const after = decodeCursor(cursor)
  if (after) query = query.or(afterCursor(after))
  const { data, error } = await query
  if (error) fail('ledger', error)
  return toPage(ledgerRow.array().parse(data), (row) => ({
    id: row.id,
    createdAt: row.created_at,
    pool: row.pool,
    kind: row.kind,
    delta: row.delta,
    balanceAfter: row.balance_after,
    reason: row.reason,
  }))
}

const jobRow = z.object({
  id: z.uuid(),
  created_at: z.string(),
  template_id: z.string(),
  status: z.enum(['running', 'succeeded', 'failed']),
  credits_cost: z.number(),
  credit_pool: z.enum(['free', 'paid']),
  error_code: z.string().nullable(),
  deleted_at: z.string().nullable().optional(),
  ...toggleColumnsSchema,
})

const JOB_COLUMNS = `id, created_at, template_id, status, credits_cost, credit_pool, error_code, deleted_at, ${TOGGLE_COLUMNS}`

const toUserJob = (row: z.infer<typeof jobRow>): UserJob => ({
  id: row.id,
  createdAt: row.created_at,
  templateId: row.template_id,
  status: row.status,
  creditsCost: row.credits_cost,
  creditPool: row.credit_pool,
  errorCode: row.error_code,
  deletedByUser: Boolean(row.deleted_at),
  toggles: toJobToggles(row),
})

// The job a lookup landed on (?job=), by primary key, and only if it belongs to this user.
async function focusedJob(db: SupabaseClient, userId: string, jobId: string | null | undefined): Promise<UserJob | null> {
  if (!jobId || !isUuid(jobId)) return null
  const { data, error } = await db.from('generation_jobs').select(JOB_COLUMNS).eq('id', jobId).eq('user_id', userId).maybeSingle()
  if (error) fail('job', error)
  return data ? toUserJob(jobRow.parse(data)) : null
}

// The recent jobs, plus the focused job on top when it is older than those.
export async function recentJobs(db: SupabaseClient, userId: string, focusJobId?: string | null): Promise<UserJob[]> {
  if (!isUuid(userId)) return []
  const [recent, focus] = await Promise.all([
    db.from('generation_jobs').select(JOB_COLUMNS).eq('user_id', userId).order('created_at', { ascending: false }).limit(RECENT_JOBS),
    focusedJob(db, userId, focusJobId),
  ])
  if (recent.error) fail('jobs', recent.error)
  const jobs = jobRow.array().parse(recent.data).map(toUserJob)
  return focus && !jobs.some((job) => job.id === focus.id) ? [focus, ...jobs] : jobs
}
