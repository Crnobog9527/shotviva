import 'server-only'

import { notifyOwner } from '../alerts'
import { track } from '../analytics/server-track'
import type { RpcClient } from '../billing/rpc'
import { AppError } from '../errors'
import type { Locale } from '../i18n/locales'
import { reportInputSchema, reportWork, type ReportOutcome } from './rpc'

// A visitor's report from a work page (ARCHITECTURE §9 第 8 条). The work stays up; the Owner is
// told once per work per hour and decides on the review page.
// The work_report event (§16.2) counts real visitors on the live site only; the caller says
// whether this reporter is one.
export type ReportContext = { locale: Locale; count: boolean }

export async function submitReport(db: RpcClient, reporter: string, body: unknown, ctx: ReportContext): Promise<ReportOutcome> {
  const input = reportInputSchema.safeParse(body)
  if (!input.success) throw new AppError('INVALID_INPUT', 'Pick a reason (a note is at most 500 characters)')
  const outcome = await reportWork(db, reporter, input.data)
  if (outcome === 'reported') {
    notifyOwner({ kind: 'work_reported', jobId: input.data.jobId, reason: input.data.reason })
    if (ctx.count) track('work_report', { reason: input.data.reason }, { distinctId: reporter, locale: ctx.locale })
  }
  return outcome
}
