import type Stripe from 'stripe'

import { isRespondable } from './labels'

// What Stripe says about a dispute right now (T82): the admin page reads status, deadline and the
// staged evidence from Stripe, the one place they live; the database keeps only our own row.

export const TEXT_FIELDS = [
  'uncategorized_text',
  'product_description',
  'access_activity_log',
  'refund_policy_disclosure',
  'refund_refusal_explanation',
  'cancellation_policy_disclosure',
  'customer_email_address',
  'customer_name',
  'customer_purchase_ip',
  'service_date',
] as const satisfies readonly (keyof Stripe.Dispute.Evidence)[]

export type TextField = (typeof TEXT_FIELDS)[number]

// The file slots the Owner may fill from the admin page.
export const FILE_FIELDS = ['receipt', 'service_documentation', 'customer_communication', 'uncategorized_file'] as const
export type FileField = (typeof FILE_FIELDS)[number]

export type LiveDispute = {
  id: string
  status: string
  dueBy: Date | null
  submissionCount: number
  hasEvidence: boolean
  // Stripe still takes evidence (needs a response, nothing submitted yet).
  open: boolean
  text: Partial<Record<TextField, string>>
  files: Partial<Record<FileField, string>>
}

const fileId = (value: string | Stripe.File | null | undefined) => (typeof value === 'string' ? value : (value?.id ?? null))

function staged(evidence: Stripe.Dispute.Evidence): Pick<LiveDispute, 'text' | 'files'> {
  const text: LiveDispute['text'] = {}
  for (const field of TEXT_FIELDS) {
    const value = evidence[field]
    if (typeof value === 'string' && value.length > 0) text[field] = value
  }
  const files: LiveDispute['files'] = {}
  for (const field of FILE_FIELDS) {
    const id = fileId(evidence[field])
    if (id) files[field] = id
  }
  return { text, files }
}

export function toLive(dispute: Stripe.Dispute): LiveDispute {
  const details = dispute.evidence_details
  const due = details?.due_by ? new Date(details.due_by * 1000) : null
  const submissionCount = details?.submission_count ?? 0
  return {
    id: dispute.id,
    status: dispute.status,
    dueBy: due,
    submissionCount,
    hasEvidence: details?.has_evidence ?? false,
    open: isRespondable(dispute.status) && submissionCount === 0 && due !== null,
    ...staged(dispute.evidence ?? {}),
  }
}
