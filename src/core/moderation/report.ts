import 'server-only'

import { notifyOwner } from '../alerts'
import type { RpcClient } from '../billing/rpc'
import { AppError } from '../errors'
import { reportInputSchema, reportWork, type ReportOutcome } from './rpc'

// A visitor's report from a work page (ARCHITECTURE §9 第 8 条). The work stays up; the Owner is
// told once per work per hour and decides on the review page.
export async function submitReport(db: RpcClient, reporter: string, body: unknown): Promise<ReportOutcome> {
  const input = reportInputSchema.safeParse(body)
  if (!input.success) throw new AppError('INVALID_INPUT', 'Pick a reason (a note is at most 500 characters)')
  const outcome = await reportWork(db, reporter, input.data)
  if (outcome === 'reported') notifyOwner({ kind: 'work_reported', jobId: input.data.jobId, reason: input.data.reason })
  return outcome
}
