import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'

import { afterCursor, decodeCursor, PAGE_SIZE, toPage, type Page } from '../cursor'
import { RECENT_JOBS, type AdminUserRow, type LedgerEntry, type UserDetail, type UserJob } from './types'

// Reads for /admin/users, service-role client only. Indexes: admin_search_users (0165);
// profiles primary key; credit_ledger_user_id_created_at_idx; generation_jobs_user_id_created_at_idx.

const fail = (what: string, error: { message: string }): never => {
  throw new AppError('INTERNAL', `admin users ${what} failed`, { cause: new Error(error.message) })
}

const isUuid = (id: string) => z.uuid().safeParse(id).success

const role = z.enum(['user', 'admin']).catch('user')

const searchRow = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  // auth.users.created_at is nullable.
  created_at: z.string().nullable(),
  provider: z.string().nullable(),
  role: role.nullable(),
  credits: z.number().nullable(),
  free_credits: z.number().nullable(),
  paid_until: z.string().nullable(),
  generation_count: z.number(),
  last_generation_at: z.string().nullable(),
  banned_at: z.string().nullable(),
})

export async function searchUsers(db: SupabaseClient, query: string): Promise<AdminUserRow[]> {
  if (query.trim().length === 0) return []
  const { data, error } = await db.rpc('admin_search_users', { p_query: query.trim() })
  if (error) fail('search', error)
  return searchRow.array().parse(data).map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    provider: row.provider,
    role: row.role ?? 'user',
    credits: row.credits ?? 0,
    freeCredits: row.free_credits ?? 0,
    paidUntil: row.paid_until,
    generationCount: row.generation_count,
    lastGenerationAt: row.last_generation_at,
    bannedAt: row.banned_at,
  }))
}

const profileRow = z.object({
  id: z.uuid(),
  role,
  credits: z.number(),
  free_credits: z.number(),
  paid_until: z.string().nullable(),
  banned_at: z.string().nullable(),
  created_at: z.string(),
})

// Profile by primary key; the email is read live from Auth, never copied (ARCHITECTURE §10).
export async function loadUser(db: SupabaseClient, id: string): Promise<UserDetail | null> {
  if (!isUuid(id)) return null
  const [profile, auth] = await Promise.all([
    db.from('profiles').select('id, role, credits, free_credits, paid_until, banned_at, created_at').eq('id', id).maybeSingle(),
    db.auth.admin.getUserById(id),
  ])
  if (profile.error) fail('profile', profile.error)
  if (!profile.data) return null
  const row = profileRow.parse(profile.data)
  return {
    id: row.id,
    email: auth.data.user?.email ?? null,
    createdAt: row.created_at,
    role: row.role,
    credits: row.credits,
    freeCredits: row.free_credits,
    paidUntil: row.paid_until,
    bannedAt: row.banned_at,
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
})

export async function recentJobs(db: SupabaseClient, userId: string): Promise<UserJob[]> {
  if (!isUuid(userId)) return []
  const { data, error } = await db
    .from('generation_jobs')
    .select('id, created_at, template_id, status, credits_cost, credit_pool, error_code')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(RECENT_JOBS)
  if (error) fail('jobs', error)
  return jobRow.array().parse(data).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    templateId: row.template_id,
    status: row.status,
    creditsCost: row.credits_cost,
    creditPool: row.credit_pool,
    errorCode: row.error_code,
  }))
}
