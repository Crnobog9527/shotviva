import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { beijingDayStart } from '../jobs/filters'
import type { UserFilters } from './list-filters'
import { USER_TIERS, USERS_PAGE_SIZE, type UserListPage, type UserListRow } from './list-types'

// The /admin/users list: one admin_list_users call (0620) answers the page and the total. The
// indexes behind each filter are listed in that migration.

const rowSchema = z.object({
  id: z.uuid(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  created_at: z.string(),
  provider: z.string().nullable(),
  role: z.enum(['user', 'admin']).catch('user'),
  credits: z.number(),
  free_credits: z.number(),
  paid_until: z.string().nullable(),
  tier: z.enum(USER_TIERS).catch('free'),
  product_id: z.string().nullable(),
  last_generation_at: z.string().nullable(),
  banned_at: z.string().nullable(),
})

const resultSchema = z.object({ total: z.number().int().min(0), rows: rowSchema.array() })

// starter_monthly / pro_yearly (site.config products) → the plan's billing interval.
export function planInterval(productId: string | null): UserListRow['interval'] {
  if (productId?.endsWith('_monthly')) return 'month'
  if (productId?.endsWith('_yearly')) return 'year'
  return null
}

const toRow = (row: z.infer<typeof rowSchema>): UserListRow => ({
  id: row.id,
  email: row.email || null,
  phone: row.phone || null,
  createdAt: row.created_at,
  provider: row.provider,
  role: row.role,
  credits: row.credits,
  freeCredits: row.free_credits,
  paidUntil: row.paid_until,
  tier: row.tier,
  interval: row.tier === 'free' ? null : planInterval(row.product_id),
  lastGenerationAt: row.last_generation_at,
  bannedAt: row.banned_at,
})

// PostgREST's "no such function" (PGRST202) or Postgres's undefined_function (42883): this code
// is live but migration 0620 has not run on this database yet (deploy before DB push).
export function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '')
}

const rpcArgs = (filters: UserFilters) => ({
  p_query: filters.q ?? null,
  p_tier: filters.tier ?? null,
  p_provider: filters.provider ?? null,
  p_status: filters.status ?? null,
  p_from: filters.from ? beijingDayStart(filters.from) : null,
  p_to: filters.to ? beijingDayStart(filters.to, 1) : null,
  p_sort: filters.sort ?? 'created',
  p_page: filters.page ?? 1,
})

export async function listUsers(db: SupabaseClient, filters: UserFilters): Promise<UserListPage> {
  const page = filters.page ?? 1
  const { data, error } = await db.rpc('admin_list_users', rpcArgs(filters))
  if (error && isMissingFunction(error)) {
    logger.warn('admin.users.list_unavailable', { code: error.code })
    return { total: 0, page, pageCount: 1, rows: [], unavailable: true }
  }
  if (error) throw new AppError('INTERNAL', 'admin list users failed', { cause: new Error(error.message) })
  const result = resultSchema.parse(data)
  return {
    total: result.total,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / USERS_PAGE_SIZE)),
    rows: result.rows.map(toRow),
  }
}
