import 'server-only'

import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import {
  attachEvidenceFile,
  DISPUTE_ERRORS,
  FILE_FIELDS,
  loadDisputeRow,
  saveSupplement,
  submitEvidence,
  type LiveDispute,
  type ManageDeps,
} from '@/core/billing/stripe'
import { AppError, toAppError } from '@/core/errors'
import { logger } from '@/core/logger'
import type { ObjectStore } from '@/core/storage'

import { DISPUTES_COPY as COPY } from './copy'

// The admin layer over core/billing/stripe/disputes (T82): Chinese errors, and attachments
// staged in the private bucket's uploads-admin/ prefix (7-day lifecycle) so no bytes pass a
// function body (AGENTS §6); the server then reads the object and uploads it to Stripe.

const ERRORS: Record<string, string> = {
  [DISPUTE_ERRORS.notFound]: COPY.errors.notFound,
  [DISPUTE_ERRORS.closed]: COPY.errors.closed,
  [DISPUTE_ERRORS.stripeAnswers]: COPY.errors.stripeAnswers,
  [DISPUTE_ERRORS.noEvidence]: COPY.errors.noEvidence,
  [DISPUTE_ERRORS.submitted]: COPY.errors.submitted,
  DISPUTE_ALREADY_SUBMITTED: COPY.errors.submitted,
  DISPUTE_NOT_OURS: COPY.errors.stripeAnswers,
  DISPUTE_NOT_FOUND: COPY.errors.notFound,
}

function friendly(error: unknown): never {
  const appError = toAppError(error)
  const message = ERRORS[appError.message]
  if (message) throw new AppError(appError.code, message)
  if (appError.code === 'INVALID_INPUT') throw new AppError('INVALID_INPUT', COPY.errors.text)
  throw appError
}

export function saveDisputeText(deps: ManageDeps, input: { id: unknown; text: unknown }): Promise<LiveDispute> {
  return saveSupplement(deps, input).catch(friendly)
}

export async function submitDispute(deps: ManageDeps, input: { id: unknown; actorId: string }): Promise<Date> {
  const at = await submitEvidence(deps, input).catch(friendly)
  logger.info('admin.disputes.submitted', { dispute_id: String(input.id), actor: input.actorId })
  return at
}

const FILE_TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' } as const
type FileType = keyof typeof FILE_TYPES
const MAX_FILE_BYTES = 4 * 1024 * 1024
const UPLOAD_TTL_SECONDS = 600

const uploadSchema = z.object({
  id: z.string(),
  contentType: z.enum(Object.keys(FILE_TYPES) as [FileType, ...FileType[]]),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
})

export type DisputeUploadTicket = { key: string; putUrl: string; headers: { 'Content-Type': string } }

export async function createDisputeUpload(deps: ManageDeps & { uploads: ObjectStore }, input: unknown): Promise<DisputeUploadTicket> {
  const parsed = uploadSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', COPY.errors.file)
  const row = await loadDisputeRow(deps.db, parsed.data.id).catch(friendly)
  const key = `uploads-admin/disputes/${row.stripe_dispute_id}/${randomUUID()}.${FILE_TYPES[parsed.data.contentType]}`
  const putUrl = await deps.uploads.presignPut(key, parsed.data.contentType, UPLOAD_TTL_SECONDS)
  return { key, putUrl, headers: { 'Content-Type': parsed.data.contentType } }
}

// The real type, from the bytes: a renamed file is refused.
const MAGIC: readonly [FileType, readonly number[]][] = [
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
]

export function sniffEvidenceFile(bytes: Uint8Array): FileType | null {
  return MAGIC.find(([, magic]) => magic.every((byte, i) => bytes[i] === byte))?.[0] ?? null
}

const attachSchema = z.object({ id: z.string(), key: z.string(), field: z.enum(FILE_FIELDS) })

export async function attachDisputeFile(deps: ManageDeps & { uploads: ObjectStore }, input: unknown): Promise<LiveDispute> {
  const parsed = attachSchema.safeParse(input)
  if (!parsed.success) throw new AppError('INVALID_INPUT', COPY.errors.file)
  const { id, key, field } = parsed.data
  if (!new RegExp(`^uploads-admin/disputes/${id}/[0-9a-f-]{36}\\.(pdf|png|jpg)$`).test(key)) throw new AppError('INVALID_INPUT', COPY.errors.upload)
  const head = await deps.uploads.head(key)
  if (!head) throw new AppError('INVALID_INPUT', COPY.errors.upload)
  if (head.size > MAX_FILE_BYTES) throw new AppError('INVALID_INPUT', COPY.errors.file)
  const bytes = await deps.uploads.get(key)
  const contentType = sniffEvidenceFile(bytes)
  if (!contentType) throw new AppError('INVALID_INPUT', COPY.errors.file)
  const filename = `${field}.${FILE_TYPES[contentType]}`
  const live = await attachEvidenceFile(deps, { id, file: { field, bytes, contentType, filename } }).catch(friendly)
  await deps.uploads.delete(key).catch((error: unknown) => logger.warn('staged dispute file not deleted', { key, error }))
  return live
}
