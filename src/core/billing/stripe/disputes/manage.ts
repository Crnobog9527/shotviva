import 'server-only'

import { z } from 'zod'

import { AppError } from '../../../errors'
import { callRpc, type RpcClient } from '../../rpc'
import type { StripeApi } from '../client'
import { FIELD_LIMIT } from './activity-log'
import { toLive, type FileField, type LiveDispute } from './live'
import { disputeRowSchema, type DisputeRow } from './row'

// The Owner's actions on a dispute (ARCHITECTURE §6.3 「后台拒付页」, T82). Callers have passed
// requireAdmin(). Editing stays submit = false; only submitEvidence sends submit = true, once:
// our row must be unsubmitted, Stripe must still take evidence (nothing submitted there either,
// e.g. from the Dashboard), and the row is marked right after Stripe accepts.

export type ManageDeps = { stripe: StripeApi; db: RpcClient }

// Messages the admin layer turns into Chinese.
export const DISPUTE_ERRORS = {
  notFound: 'dispute not found',
  closed: 'dispute no longer takes evidence',
  stripeAnswers: 'Stripe answers this dispute',
  noEvidence: 'no evidence staged',
  submitted: 'evidence already submitted',
} as const

const disputeId = z.string().regex(/^(dp|du)_[A-Za-z0-9]+$/)

export async function loadDisputeRow(db: RpcClient, id: unknown): Promise<DisputeRow> {
  const parsed = disputeId.safeParse(id)
  if (!parsed.success) throw new AppError('NOT_FOUND', DISPUTE_ERRORS.notFound)
  const rows = await callRpc(db, 'admin_get_dispute', { p_dispute_id: parsed.data }, z.array(disputeRowSchema))
  const row = rows[0]
  if (!row) throw new AppError('NOT_FOUND', DISPUTE_ERRORS.notFound)
  return row
}

export async function loadLiveDispute(stripe: StripeApi, id: string): Promise<LiveDispute> {
  return toLive(await stripe.disputes.retrieve(id))
}

async function openForEdit(deps: ManageDeps, id: unknown): Promise<{ row: DisputeRow; live: LiveDispute }> {
  const row = await loadDisputeRow(deps.db, id)
  if (row.submitted_at) throw new AppError('CONFLICT', DISPUTE_ERRORS.submitted)
  const live = await loadLiveDispute(deps.stripe, row.stripe_dispute_id)
  if (!live.open) throw new AppError('CONFLICT', DISPUTE_ERRORS.closed)
  return { row, live }
}

const supplementSchema = z.string().trim().min(1).max(FIELD_LIMIT)

// The summary field (uncategorized_text), replaced by the Owner's edited version.
export async function saveSupplement(deps: ManageDeps, input: { id: unknown; text: unknown }): Promise<LiveDispute> {
  const text = supplementSchema.safeParse(input.text)
  if (!text.success) throw new AppError('INVALID_INPUT', 'text must be 1 to 20,000 characters')
  const { row } = await openForEdit(deps, input.id)
  return toLive(await deps.stripe.disputes.update(row.stripe_dispute_id, { evidence: { uncategorized_text: text.data }, submit: false }))
}

export type EvidenceFile = { field: FileField; bytes: Uint8Array; contentType: 'application/pdf' | 'image/png' | 'image/jpeg'; filename: string }

// Uploads the file to Stripe (purpose dispute_evidence) and stages it in its slot.
export async function attachEvidenceFile(deps: ManageDeps, input: { id: unknown; file: EvidenceFile }): Promise<LiveDispute> {
  const { row } = await openForEdit(deps, input.id)
  const { file } = input
  const uploaded = await deps.stripe.files.create({
    purpose: 'dispute_evidence',
    file: { data: Buffer.from(file.bytes), name: file.filename, type: file.contentType },
  })
  return toLive(await deps.stripe.disputes.update(row.stripe_dispute_id, { evidence: { [file.field]: uploaded.id }, submit: false }))
}

export async function submitEvidence(deps: ManageDeps, input: { id: unknown; actorId: string }): Promise<Date> {
  const { row, live } = await openForEdit(deps, input.id)
  if (row.responder !== 'shotviva') throw new AppError('FORBIDDEN', DISPUTE_ERRORS.stripeAnswers)
  if (!live.hasEvidence) throw new AppError('INVALID_INPUT', DISPUTE_ERRORS.noEvidence)
  await deps.stripe.disputes.update(row.stripe_dispute_id, { submit: true })
  const at = await callRpc(
    deps.db,
    'admin_mark_dispute_submitted',
    { p_dispute_id: row.stripe_dispute_id, p_actor: input.actorId },
    z.string().transform((value) => new Date(value)),
  )
  return at
}
