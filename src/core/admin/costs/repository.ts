import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc, type RpcClient } from '@/core/billing'
import { AppError } from '@/core/errors'

import type { OurDay } from './reconcile'

// Database side of /admin/costs (T33): our per-day totals (admin_daily_costs, 0284) and the
// OpenAI Admin key in Vault (0282). Service-role client only; every function refuses clients.

export const COSTS_DAYS = 30

const count = z.coerce.number().int().nonnegative()
const daysSchema = z.array(
  z.object({ day: z.string(), cost_usd: z.coerce.number().nonnegative(), costed: count, uncosted: count, no_usage: count }),
)

export function loadOurDailyCosts(db: RpcClient, days: number = COSTS_DAYS): Promise<OurDay[]> {
  return callRpc(db, 'admin_daily_costs', { p_days: days }, daysSchema)
}

export type AdminKeyStatus = { keyLast4: string | null; projectId: string | null }

const statusSchema = z.array(z.object({ key_last4: z.string().nullable(), project_id: z.string().nullable() }))
const keySchema = z.array(z.object({ api_key: z.string().nullable(), project_id: z.string().nullable() }))

function fail(what: string, error: { message: string }): never {
  if (error.message.includes('PROVIDER_KEY_INVALID')) {
    throw new AppError('INVALID_INPUT', '密钥格式不对：16～1024 个字符，不能有空格或换行')
  }
  if (error.message.includes('INVALID_INPUT')) throw new AppError('INVALID_INPUT', '项目 ID 格式不对，应形如 proj_abc123')
  throw new AppError('INTERNAL', `${what} failed`, { cause: new Error(error.message) })
}

// What the page shows: last four characters only (null: no key) and the project filter.
export async function loadAdminKeyStatus(db: SupabaseClient): Promise<AdminKeyStatus> {
  const { data, error } = await db.rpc('admin_openai_admin_key_status')
  if (error) fail('admin_openai_admin_key_status', error)
  const row = statusSchema.parse(data)[0]
  return { keyLast4: row?.key_last4 ?? null, projectId: row?.project_id ?? null }
}

// The plaintext key, for the Costs API call only. Never cached, logged or returned to a page.
export async function readAdminKey(db: SupabaseClient): Promise<{ apiKey: string | null; projectId: string | null }> {
  const { data, error } = await db.rpc('openai_admin_key')
  if (error) fail('openai_admin_key', error)
  const row = keySchema.parse(data)[0]
  return { apiKey: row?.api_key ?? null, projectId: row?.project_id ?? null }
}

// Stores, replaces or (null) clears the key; clearing also clears the project id.
export async function setAdminKey(db: SupabaseClient, apiKey: string | null): Promise<void> {
  const { error } = await db.rpc('admin_set_openai_admin_key', { p_key: apiKey })
  if (error) fail('admin_set_openai_admin_key', error)
}

export async function setCostsProject(db: SupabaseClient, projectId: string | null): Promise<void> {
  const { error } = await db.rpc('admin_set_openai_costs_project', { p_project_id: projectId })
  if (error) fail('admin_set_openai_costs_project', error)
}
