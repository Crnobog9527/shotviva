import 'server-only'

import { z } from 'zod'

import { callRpc, type RpcClient } from '../billing/rpc'
import type { ScreenVerdict } from './openai-screen'
import {
  MODERATION_STATUSES,
  REJECT_REASONS,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type ModerationStatus,
  type RejectReason,
} from './reasons'


// The SQL functions behind moderation (ARCHITECTURE §9.1, migrations 1205–1207). Service role only.

// Null when the work is no longer a live public work (deleted, made private): nothing was written.
export function recordAutoModeration(db: RpcClient, jobId: string, verdict: ScreenVerdict): Promise<ModerationStatus | null> {
  return callRpc(
    db,
    'record_work_auto_moderation',
    { p_job_id: jobId, p_flagged: verdict.flagged, p_categories: verdict.categories },
    z.enum(MODERATION_STATUSES).nullable(),
  )
}

// One failed screen: the attempt is counted for the sweep's back-off. Null when the work no
// longer waits for its screen.
export function recordScreenFailure(db: RpcClient, jobId: string): Promise<number | null> {
  return callRpc(db, 'record_work_screen_failure', { p_job_id: jobId }, z.number().int().nullable())
}

export type ModerateInput = { jobIds: string[]; decision: 'approved' | 'rejected'; reason: RejectReason | null }

export const moderateInputSchema = z
  .object({
    jobIds: z.array(z.uuid()).min(1).max(50),
    decision: z.enum(['approved', 'rejected']),
    reason: z.enum(REJECT_REASONS).nullable(),
  })
  .refine((input) => input.decision === 'approved' || input.reason !== null, { message: 'a rejection needs a reason' })

// How many works changed; NOT_ADMIN → FORBIDDEN through callRpc's error mapping.
export function moderateWorks(db: RpcClient, actor: string, input: ModerateInput): Promise<number> {
  return callRpc(
    db,
    'admin_moderate_works',
    { p_actor: actor, p_job_ids: input.jobIds, p_decision: input.decision, p_reason: input.decision === 'rejected' ? input.reason : null },
    z.number().int(),
  )
}

export const reportInputSchema = z.object({
  jobId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
})
export type ReportInput = z.infer<typeof reportInputSchema>
export type ReportOutcome = 'reported' | 'duplicate' | 'limited'

export function reportWork(db: RpcClient, reporter: string, input: ReportInput): Promise<ReportOutcome> {
  return callRpc(
    db,
    'report_work',
    { p_job_id: input.jobId, p_reporter: reporter, p_reason: input.reason, p_note: input.note || null },
    z.enum(['reported', 'duplicate', 'limited']),
  )
}
