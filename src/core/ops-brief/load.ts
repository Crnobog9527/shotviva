import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { posthogAccess } from '@/core/admin/analytics/access'
import { loadFunnel } from '@/core/admin/analytics/funnel'
import { queryRunner } from '@/core/admin/analytics/posthog-query'
import { windowFor, type Window } from '@/core/admin/analytics/range'
import { feishuConfig } from '@/core/alerts/alerts-env'
import { sendFeishu } from '@/core/alerts/feishu'
import { createAdminSupabase } from '@/core/auth/supabase-admin'
import { serverEnv } from '@/core/env'
import { logger } from '@/core/logger'

import { renderBrief, sumPayments, type BriefData, type Pair, type PaymentRow } from './brief'

// Reads for the daily brief. Only selects and counts: nothing here writes anywhere. The counts
// follow the admin overview (admin_dashboard_stats, admin_revenue_stats, admin_todo_counts).

const READ_TIMEOUT_MS = 10_000

const timeout = () => AbortSignal.timeout(READ_TIMEOUT_MS)

type Filter = (query: CountQuery) => CountQuery
// Narrow view of the builder: just what the counts below use.
type CountQuery = {
  gte(column: string, value: string): CountQuery
  lt(column: string, value: string): CountQuery
  eq(column: string, value: string): CountQuery
  limit(n: number): CountQuery
  abortSignal(signal: AbortSignal): PromiseLike<{ count: number | null; error: { message: string } | null }>
}

async function countRows(db: SupabaseClient, table: string, filter: Filter): Promise<number> {
  // Every table counted here has an id; one row comes back with the count (no HEAD, see eslint).
  const base = db.from(table).select('id', { count: 'exact' }) as unknown as CountQuery
  const { count, error } = await filter(base).limit(1).abortSignal(timeout())
  if (error) throw new Error(`${table} count failed: ${error.message}`)
  return count ?? 0
}

async function pair(db: SupabaseClient, table: string, window: Window, extra: Filter = (q) => q): Promise<Pair> {
  const between = (start: string, end: string): Filter => (q) => extra(q.gte('created_at', start).lt('created_at', end))
  const [today, yesterday] = await Promise.all([
    countRows(db, table, between(window.start, window.end)),
    countRows(db, table, between(window.prevStart, window.prevEnd)),
  ])
  return { today, yesterday }
}

async function readPayments(db: SupabaseClient, window: Window) {
  const { data, error } = await db
    .from('payments')
    .select('created_at, currency, amount_total, amount_refunded, amount_tax')
    .gte('created_at', window.prevStart)
    .lt('created_at', window.end)
    .limit(5000)
    .abortSignal(timeout())
  if (error) throw new Error(`payments read failed: ${error.message}`)
  return sumPayments((data ?? []) as PaymentRow[], window)
}

async function readFunnel(window: Window): Promise<readonly number[] | 'unset'> {
  const access = posthogAccess()
  if (!access) return 'unset'
  return (await loadFunnel(queryRunner(access), window, 'none')).current
}

// A part that fails is logged by name (never with values) and shown as 「暂时读不到」.
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    logger.warn('ops_brief.part_failed', { part: name, reason: error instanceof Error ? error.message : 'unknown' })
    return null
  }
}

export async function loadBrief(now: Date, db: SupabaseClient = createAdminSupabase()): Promise<BriefData> {
  const window = windowFor('today', now)
  const [signups, generated, failed, money, funnel, openTickets] = await Promise.all([
    part('signups', () => pair(db, 'profiles', window)),
    part('generated', () => pair(db, 'generation_jobs', window, (q) => q.eq('status', 'succeeded'))),
    part('failed', () => pair(db, 'generation_jobs', window, (q) => q.eq('status', 'failed'))),
    part('payments', () => readPayments(db, window)),
    part('funnel', () => readFunnel(window)),
    part('tickets', () => countRows(db, 'support_tickets', (q) => q.eq('status', 'open'))),
  ])
  return {
    window,
    signups,
    generated,
    failed,
    payments: money?.payments ?? null,
    netRevenue: money?.netRevenue ?? null,
    funnel,
    openTickets,
  }
}

export type BriefOutcome = 'sent' | 'not_configured' | 'failed'

// Never throws: the brief is a side job and must not take anything else down with it.
export async function sendDailyBrief(now = new Date()): Promise<BriefOutcome> {
  try {
    const { config, problem } = feishuConfig(serverEnv())
    if (!config) {
      if (problem) logger.warn('ops_brief.not_configured', { problem })
      return 'not_configured'
    }
    const text = renderBrief(await loadBrief(now))
    await sendFeishu(config, text, { fetch, now: Date.now })
    return 'sent'
  } catch (error) {
    logger.error('ops_brief.failed', { reason: error instanceof Error ? error.message : 'unknown' })
    return 'failed'
  }
}
