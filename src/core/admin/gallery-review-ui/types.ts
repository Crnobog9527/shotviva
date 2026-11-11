import type { RejectReason } from '@/core/moderation/reasons'

import type { ActionValue } from '../templates/types'

export type Decision = { jobIds: string[]; decision: 'approved' | 'rejected'; reason: RejectReason | null }
export type ReviewActions = { decide: (input: Decision) => Promise<ActionValue<number>> }
// The decision waiting in the confirmation dialog; null while it is closed.
export type PendingDecision = Decision | null
