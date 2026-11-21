import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { AppError } from '@/core/errors'
import { logger } from '@/core/logger'

import { canGoBack, currentPeriod, readMemberStats, resolvePeriod, shiftPeriod, sumStats } from '../stats'
import { accountLabels } from './reads'
import type { OwnerConsole, OwnerReport } from './types'

// The owner's monthly performance table (card E5). `month` comes from the query string and is
// clamped to a real past-or-current UTC month. A failed read returns null instead of taking the
// console down: the panel says the table is unavailable.
export async function readOwnerReport(
  { db, user, console: view, month, now = new Date(), maskPhone = (phone) => phone }:
  { db: SupabaseClient; user: string; console: OwnerConsole; month: string | null | undefined; now?: Date; maskPhone?: (phone: string) => string },
): Promise<OwnerReport | null> {
  const period = resolvePeriod(month, now)
  try {
    const rows = await readMemberStats(db, user, view.org.id, period)
    const labels = await accountLabels(db, rows.map((r) => r.userId), maskPhone)
    return {
      period,
      previous: canGoBack(period) ? shiftPeriod(period, -1) : null,
      next: period < currentPeriod(now) ? shiftPeriod(period, 1) : null,
      withAffiliate: view.org.affiliateEnabled,
      withLevel2: view.org.affiliateEnabled && view.org.affiliateLevels === 2,
      rows: rows.map((r) => ({ ...r, account: labels.get(r.userId) ?? null })),
      totals: sumStats(rows),
    }
  } catch (error) {
    logger.warn('org monthly report unavailable', { code: error instanceof AppError ? error.code : 'UNKNOWN' })
    return null
  }
}
